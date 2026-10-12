import { db } from "@/db";
import { photos } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ filename: string }> };

// Отдача загруженных фото из таблицы photos в базе данных.
// На Vercel файловая система только для чтения, поэтому
// фото живут в БД, а не в public/uploads.
export async function GET(_request: Request, { params }: Ctx) {
  const { filename } = await params;

  if (!/^[a-z0-9_.-]+$/i.test(filename)) {
    return new Response("Недопустимое имя файла", { status: 400 });
  }

  const [photo] = await db.select().from(photos).where(eq(photos.filename, filename));
  if (!photo) {
    return new Response("Не найдено", { status: 404 });
  }

  const buffer = Buffer.from(photo.data, "base64");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": photo.mime,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
