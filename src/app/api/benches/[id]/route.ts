import { db } from "@/db";
import { benches, reviews } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

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

export async function DELETE(_request: Request, { params }: Ctx) {
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
