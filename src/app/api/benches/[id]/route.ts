import { db } from "@/db";
import { benches, reviews } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { checkAdmin, adminDenied } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const benchId = Number(id);
  if (!Number.isInteger(benchId)) {
    return Response.json({ error: "Некорректный id" }, { status: 400 });
  }

  const [bench] = await db.select().from(benches).where(eq(benches.id, benchId));
  if (!bench) {
    return Response.json({ error: "Скамейка не найдена" }, { status: 404 });
  }

  const benchReviews = await db
    .select()
    .from(reviews)
    .where(eq(reviews.benchId, benchId))
    .orderBy(desc(reviews.createdAt));

  const reviewCount = benchReviews.length;
  const avgRating =
    reviewCount === 0
      ? null
      : benchReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount;

  return Response.json({
    ...bench,
    createdAt: bench.createdAt.toISOString(),
    reviewCount,
    avgRating,
    reviews: benchReviews.map((r: any) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

// Редактирование скамейки (название, описание) — только администратор.
export async function PATCH(request: Request, { params }: Ctx) {
  if (!checkAdmin(request)) return adminDenied();

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

  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";

  if (!title || title.length > 120) {
    return Response.json(
      { error: "Название обязательно (до 120 символов)" },
      { status: 400 },
    );
  }
  if (description.length > 2000) {
    return Response.json(
      { error: "Описание слишком длинное (до 2000 символов)" },
      { status: 400 },
    );
  }

  const updated = await db
    .update(benches)
    .set({ title, description: description || null })
    .where(eq(benches.id, benchId))
    .returning();

  if (updated.length === 0) {
    return Response.json({ error: "Скамейка не найдена" }, { status: 404 });
  }

  const [bench] = updated;
  return Response.json({ ...bench, createdAt: bench.createdAt.toISOString() });
}

export async function DELETE(request: Request, { params }: Ctx) {
  if (!checkAdmin(request)) return adminDenied();

  const { id } = await params;
  const benchId = Number(id);
  if (!Number.isInteger(benchId)) {
    return Response.json({ error: "Некорректный id" }, { status: 400 });
  }
  const deleted = await db.delete(benches).where(eq(benches.id, benchId)).returning();
  if (deleted.length === 0) {
    return Response.json({ error: "Скамейка не найдена" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
