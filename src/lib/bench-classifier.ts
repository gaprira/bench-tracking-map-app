// Распознавание «на фото скамейка?» — своя маленькая модель, без внешних сервисов.
//
// MobileCLIP-S0 (Apple, открытая лицензия): визуальная часть лежит в
// models/mobileclip_s0_vision_fp16.onnx, текстовые описания посчитаны заранее
// (src/lib/bench-prompts.json). Картинка сравнивается со всеми описаниями,
// вероятность «скамейка» = сумма softmax по описаниям-скамейкам.
//
// Точность на 237 размеченных вручную фото (3 независимых набора) при пороге 0.5:
// находит ~94% скамеек, пропускает ~5% «не скамеек» (в основном пирсы/мостки/перила).
import path from "node:path";
import sharp from "sharp";
import * as ort from "onnxruntime-node";
import prompts from "./bench-prompts.json";

export const BENCH_THRESHOLD = 0.5;
const SIZE = 256;

const MODEL_PATH = path.join(process.cwd(), "models", "mobileclip_s0_vision_fp16.onnx");

// Сессия одна на процесс: загрузка модели — самая долгая часть (холодный старт)
let session: Promise<ort.InferenceSession> | null = null;
function getSession() {
  session ??= ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  }).catch((err) => {
    session = null; // следующая попытка загрузит заново
    throw err;
  });
  return session;
}

// Предобработка как у CLIPFeatureExtractor модели: меньшая сторона → 256,
// центр 256×256, пиксели в 0..1, без нормализации, раскладка CHW
async function toPixelValues(image: Buffer): Promise<Float32Array> {
  const { data } = await sharp(image)
    .rotate() // учитываем EXIF-поворот с телефона
    .removeAlpha()
    .resize(SIZE, SIZE, { fit: "cover", position: "centre", kernel: "linear" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plane = SIZE * SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    out[i] = data[i * 3] / 255;
    out[plane + i] = data[i * 3 + 1] / 255;
    out[2 * plane + i] = data[i * 3 + 2] / 255;
  }
  return out;
}

function benchProbability(embedding: Float32Array): number {
  let norm = 0;
  for (const x of embedding) norm += x * x;
  norm = Math.sqrt(norm);
  const logit = (t: number[]) => {
    let s = 0;
    for (let i = 0; i < t.length; i++) s += t[i] * embedding[i];
    return (prompts.logitScale * s) / norm;
  };
  const benchLogits = prompts.bench.embeds.map(logit);
  const otherLogits = prompts.other.embeds.map(logit);
  const max = Math.max(...benchLogits, ...otherLogits);
  const benchSum = benchLogits.reduce((s, l) => s + Math.exp(l - max), 0);
  const otherSum = otherLogits.reduce((s, l) => s + Math.exp(l - max), 0);
  return benchSum / (benchSum + otherSum);
}

export type BenchCheck = { isBench: boolean; score: number };

/** Вероятность того, что на фото скамейка (0..1) и решение по порогу */
export async function checkBenchPhoto(image: Buffer): Promise<BenchCheck> {
  const [s, pixels] = await Promise.all([getSession(), toPixelValues(image)]);
  const input = new ort.Tensor("float32", pixels, [1, 3, SIZE, SIZE]);
  const output = await s.run({ pixel_values: input });
  const score = benchProbability(output.image_embeds.data as Float32Array);
  return { isBench: score >= BENCH_THRESHOLD, score: Math.round(score * 1000) / 1000 };
}
