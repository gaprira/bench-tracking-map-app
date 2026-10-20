import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { BENCH_THRESHOLD, checkBenchPhoto } from "@/lib/bench-classifier";

// Настоящая модель: файл на месте, onnxruntime работает, ответ осмысленный
describe("распознавание скамейки (настоящая модель)", () => {
  it("однотонная картинка — не скамейка", async () => {
    const gray = await sharp({
      create: { width: 320, height: 240, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .jpeg()
      .toBuffer();
    const result = await checkBenchPhoto(gray);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(BENCH_THRESHOLD);
    expect(result.isBench).toBe(false);
  }, 30000);
});
