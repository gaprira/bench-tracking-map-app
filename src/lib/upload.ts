import { db } from "@/db";
import { photos } from "@/db/schema";

// Фото хранятся в таблице photos в базе данных (base64).
// На Vercel файловая система только для чтения,
// поэтому сохранять файлы в public/uploads нельзя.
export async function saveUploadedFile(
  file: File,
  prefix: string
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${prefix}_${timestamp}_${random}.${ext}`;

  const mime = file.type || "image/jpeg";
  const bytes = Buffer.from(await file.arrayBuffer());

  await db.insert(photos).values({
    filename,
    mime,
    data: bytes.toString("base64"),
  });

  return `/uploads/${filename}`;
}

export function validateImageFile(file: File): string | null {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowedTypes.includes(file.type)) {
    return "Неподдерживаемый формат. Используйте JPEG, PNG, WebP или HEIC.";
  }
  // Лимит запроса на Vercel ~4.5 МБ (а фото в форме два).
  // Клиент сжимает фото перед отправкой — эта проверка лишь страховка.
  const maxSize = 4 * 1024 * 1024;
  if (file.size > maxSize) {
    return "Файл слишком большой (до 4 МБ). Перезагрузите страницу и выберите фото поменьше.";
  }
  return null;
}
