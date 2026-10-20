import { checkBenchPhoto } from "@/lib/bench-classifier";
import { validateImageFile } from "@/lib/upload";

export const dynamic = "force-dynamic";

// Подсказка для формы: «похоже ли фото на скамейку» ещё до отправки.
// Решение всё равно принимает POST /api/benches — эта ручка ничего не сохраняет.
export async function POST(request: Request) {
  let file: File | null = null;
  try {
    file = (await request.formData()).get("photo") as File | null;
  } catch {
    return Response.json({ error: "Ожидается фото (multipart/form-data)" }, { status: 400 });
  }
  if (!file || file.size === 0) {
    return Response.json({ error: "Фото не передано" }, { status: 400 });
  }
  const invalid = validateImageFile(file);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  try {
    return Response.json(await checkBenchPhoto(Buffer.from(await file.arrayBuffer())));
  } catch (err) {
    console.error("Распознавание фото не сработало:", err);
    return Response.json({ error: "Не удалось проверить фото" }, { status: 500 });
  }
}
