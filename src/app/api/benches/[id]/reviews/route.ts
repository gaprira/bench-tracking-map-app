import { db } from "@/db";
import { benches, reviews } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const benchId = Number(id);
  if (!Number.isInteger(benchId)) {
    return Response.json({ error: "Некорректный id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const data = body as Record<string, unknown>;

  const author =
    typeof data.author === "string" && data.author.trim()
      ? data.author.trim().slice(0, 80)
      : "Аноним";
  const rating = Number(data.rating);
  const text = typeof data.text === "string" ? data.text.trim() : "";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "Оценка должна быть от 1 до 5" }, { status: 400 });
  }
  if (!text || text.length > 2000) {
    return Response.json(
      { error: "Текст рецензии обязателен (до 2000 символов)" },
      { status: 400 },
    );
  }

  const [bench] = await db
    .select({ id: benches.id })
    .from(benches)
    .where(eq(benches.id, benchId));
  if (!bench) {
    return Response.json({ error: "Скамейка не найдена" }, { status: 404 });
  }

  const [created] = await db
    .insert(reviews)
    .values({ benchId, author, rating, text })
    .returning();

  return Response.json(
    { ...created, createdAt: created.createdAt.toISOString() },
    { status: 201 },
  );
}
