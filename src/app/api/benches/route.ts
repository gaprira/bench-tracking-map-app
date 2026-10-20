import { db } from "@/db";
import { benches, reviews } from "@/db/schema";
import { avg, count, desc, eq } from "drizzle-orm";
import { saveUploadedFile, validateImageFile } from "@/lib/upload";
import { normalizeTags } from "@/lib/tags";
import { checkAdmin } from "@/lib/admin";
import { checkBenchPhoto } from "@/lib/bench-classifier";

export const dynamic = "force-dynamic";

// Обычные посетители видят только одобренные скамейки, админ — ещё и «на проверке»
export async function GET(request: Request) {
  const isAdmin = checkAdmin(request);
  const rows = await db
    .select({
      id: benches.id,
      title: benches.title,
      description: benches.description,
      lat: benches.lat,
      lng: benches.lng,
      createdBy: benches.createdBy,
      createdAt: benches.createdAt,
      benchPhoto: benches.benchPhoto,
      viewPhoto: benches.viewPhoto,
      tags: benches.tags,
      status: benches.status,
      photoScore: benches.photoScore,
      reviewCount: count(reviews.id),
      avgRating: avg(reviews.rating),
    })
    .from(benches)
    .leftJoin(reviews, eq(reviews.benchId, benches.id))
    .groupBy(benches.id)
    .orderBy(desc(benches.createdAt));

  return Response.json(
    rows
      .filter((r: any) => isAdmin || (r.status ?? "approved") === "approved")
      .map((r: any) => ({
      ...r,
      status: r.status ?? "approved",
      tags: r.tags ?? [],
      createdAt: r.createdAt.toISOString(),
      reviewCount: Number(r.reviewCount),
      avgRating: r.avgRating === null ? null : Number(r.avgRating),
    })),
  );
}

export async function POST(request: Request) {
  const isAdmin = checkAdmin(request);
  // Без фото проверять нечего — такие скамейки (API напрямую) сразу на модерацию
  let status: "approved" | "pending" = isAdmin ? "approved" : "pending";
  let photoScore: number | null = null;
  const contentType = request.headers.get("content-type") || "";
  let title = "";
  let description = "";
  let createdBy = "Аноним";
  let lat = 0;
  let lng = 0;
  let rating: number | undefined;
  let reviewText = "";
  let benchPhotoPath: string | null = null;
  let viewPhotoPath: string | null = null;
  let tags: string[] = [];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    title = (formData.get("title") as string)?.trim() || "";
    description = (formData.get("description") as string)?.trim() || "";
    createdBy = ((formData.get("createdBy") as string)?.trim() || "Аноним").slice(0, 80);
    lat = Number(formData.get("lat"));
    lng = Number(formData.get("lng"));
    const ratingVal = formData.get("rating");
    if (ratingVal) rating = Number(ratingVal);
    reviewText = (formData.get("reviewText") as string)?.trim() || "";
    tags = normalizeTags(formData.getAll("tags"));

    const benchPhotoFile = formData.get("benchPhoto") as File | null;
    const viewPhotoFile = formData.get("viewPhoto") as File | null;

    if (!benchPhotoFile || benchPhotoFile.size === 0) {
      return Response.json({ error: "Фото скамейки обязательно" }, { status: 400 });
    }
    if (!viewPhotoFile || viewPhotoFile.size === 0) {
      return Response.json({ error: "Фото вида со скамейки обязательно" }, { status: 400 });
    }

    const benchPhotoError = validateImageFile(benchPhotoFile);
    if (benchPhotoError) {
      return Response.json({ error: `Фото скамейки: ${benchPhotoError}` }, { status: 400 });
    }
    const viewPhotoError = validateImageFile(viewPhotoFile);
    if (viewPhotoError) {
      return Response.json({ error: `Фото вида: ${viewPhotoError}` }, { status: 400 });
    }

    // Своя модель смотрит, похоже ли фото на скамейку. Не похоже — не отказываем,
    // а отправляем на проверку админу (модель иногда ошибается)
    try {
      const check = await checkBenchPhoto(Buffer.from(await benchPhotoFile.arrayBuffer()));
      photoScore = check.score;
      status = isAdmin || check.isBench ? "approved" : "pending";
    } catch (err) {
      console.error("Распознавание фото не сработало:", err);
      status = isAdmin ? "approved" : "pending";
    }

    benchPhotoPath = await saveUploadedFile(benchPhotoFile, "bench");
    viewPhotoPath = await saveUploadedFile(viewPhotoFile, "view");
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Некорректный JSON" }, { status: 400 });
    }

    const data = body as Record<string, unknown>;
    title = typeof data.title === "string" ? data.title.trim() : "";
    description = typeof data.description === "string" ? data.description.trim() : "";
    createdBy = typeof data.createdBy === "string" && data.createdBy.trim()
      ? data.createdBy.trim().slice(0, 80)
      : "Аноним";
    lat = Number(data.lat);
    lng = Number(data.lng);
    const r = Number(data.rating);
    if (Number.isInteger(r) && r >= 1 && r <= 5) rating = r;
    reviewText = typeof data.reviewText === "string" ? data.reviewText.trim() : "";
    tags = normalizeTags(data.tags);
  }

  if (!title || title.length > 120) {
    return Response.json(
      { error: "Название обязательно (до 120 символов)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "Некорректные координаты" }, { status: 400 });
  }

  const [created] = await db
    .insert(benches)
    .values({ title, description: description || null, lat, lng, createdBy, benchPhoto: benchPhotoPath, viewPhoto: viewPhotoPath, tags, status, photoScore })
    .returning();

  if (rating !== undefined && reviewText) {
    await db.insert(reviews).values({
      benchId: created.id,
      author: createdBy,
      rating,
      text: reviewText,
      likes: 0,
    });
  }

  const [summary] = await db
    .select({
      reviewCount: count(reviews.id),
      avgRating: avg(reviews.rating),
    })
    .from(reviews)
    .where(eq(reviews.benchId, created.id));

  return Response.json(
    {
      ...created,
      status: created.status ?? status,
      createdAt: created.createdAt.toISOString(),
      reviewCount: Number(summary?.reviewCount ?? 0),
      avgRating: summary?.avgRating === null || summary?.avgRating === undefined
        ? null
        : Number(summary.avgRating),
    },
    { status: 201 },
  );
}

