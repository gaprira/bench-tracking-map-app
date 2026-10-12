import { db } from "@/db";
import { reviews } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkAdmin, adminDenied } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Удаление отдельной рецензии — только администратор.
export async function DELETE(request: Request, { params }: Ctx) {
  if (!checkAdmin(request)) return adminDenied();

  const { id } = await params;
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId)) {
    return Response.json({ error: "Некорректный id" }, { status: 400 });
  }

  const deleted = await db
    .delete(reviews)
    .where(eq(reviews.id, reviewId))
    .returning();

  if (deleted.length === 0) {
    return Response.json({ error: "Рецензия не найдена" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
