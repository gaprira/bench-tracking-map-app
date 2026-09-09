import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

export async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function saveUploadedFile(
  file: File,
  prefix: string
): Promise<string> {
  await ensureUploadDir();

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${prefix}_${timestamp}_${random}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  await writeFile(filepath, buffer);

  return `/uploads/${filename}`;
}

export function validateImageFile(file: File): string | null {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowedTypes.includes(file.type)) {
    return "Неподдерживаемый формат. Используйте JPEG, PNG, WebP или HEIC.";
  }
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return "Файл слишком большой. Максимум 10 МБ.";
  }
  return null;
}