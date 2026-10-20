import type { Metadata } from "next";
import { avg, count, eq } from "drizzle-orm";
import BenchApp from "@/components/BenchApp";
import { db } from "@/db";
import { benches, reviews } from "@/db/schema";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function pluralReviews(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} рецензия`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} рецензии`;
  return `${n} рецензий`;
}

// Превью ссылки в мессенджерах: название, оценка и фото конкретной скамейки
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const benchId = Number((await params).id);
  if (!Number.isInteger(benchId)) return {};
  try {
    const [bench] = await db.select().from(benches).where(eq(benches.id, benchId));
    if (!bench || (bench.status ?? "approved") !== "approved")
      return { title: "Скамейка не найдена — Скамейки" };
    const [summary] = await db
      .select({ reviewCount: count(reviews.id), avgRating: avg(reviews.rating) })
      .from(reviews)
      .where(eq(reviews.benchId, benchId));
    const n = Number(summary?.reviewCount ?? 0);
    const rating =
      summary?.avgRating === null || summary?.avgRating === undefined
        ? null
        : Number(summary.avgRating);
    const stats = rating !== null ? `★ ${rating.toFixed(1)} · ${pluralReviews(n)}` : "Пока без оценок";
    const description = bench.description ? `${stats}. ${bench.description}` : stats;
    const image = bench.viewPhoto ?? bench.benchPhoto;
    return {
      title: `${bench.title} — Скамейки`,
      description,
      openGraph: {
        title: bench.title,
        description,
        type: "article",
        url: `/bench/${benchId}`,
        ...(image ? { images: [{ url: image, alt: bench.title }] } : {}),
      },
      twitter: { card: image ? "summary_large_image" : "summary" },
    };
  } catch {
    return {};
  }
}

export default async function BenchPage({ params }: Props) {
  const benchId = Number((await params).id);
  return <BenchApp initialBenchId={Number.isInteger(benchId) ? benchId : undefined} />;
}
