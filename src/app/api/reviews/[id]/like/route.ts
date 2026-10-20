import { db } from "@/db";
import { reviews } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// «Полезно» на рецензии: delta = 1 (поставить) или -1 (снять).
// Аккаунтов нет, поэтому повторные нажатия отсекает браузер (localStorage).
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId)) {
    return Response.json({ error: "Некорректный id" }, { status: 400 });
  }

  let delta = 1;
  try {
    const body = (await request.json()) as { delta?: unknown };
    if (body?.delta === -1) delta = -1;
  } catch {
    // пустое тело — обычный лайк
  }

  const [review] = await db
    .select({ likes: reviews.likes })
    .from(reviews)
    .where(eq(reviews.id, reviewId));
  if (!review) {
    return Response.json({ error: "Рецензия не найдена" }, { status: 404 });
  }

  const likes = Math.max(0, (review.likes ?? 0) + delta);
  await db.update(reviews).set({ likes }).where(eq(reviews.id, reviewId));

  return Response.json({ id: reviewId, likes });
}
