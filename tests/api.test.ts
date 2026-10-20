import { describe, expect, it, vi } from "vitest";

// Настоящая модель в unit-тестах не нужна: решение «скамейка/нет» подменяем.
// Если в названии файла есть "bench" — считаем, что на фото скамейка.
vi.mock("@/lib/bench-classifier", () => ({
  BENCH_THRESHOLD: 0.5,
  checkBenchPhoto: vi.fn(async (buf: Buffer) => {
    const isBench = buf.toString().includes("BENCH");
    return { isBench, score: isBench ? 0.97 : 0.03 };
  }),
}));
import { GET as listBenches, POST as createBench } from "@/app/api/benches/route";
import {
  DELETE as deleteBench,
  GET as getBench,
  PATCH as patchBench,
} from "@/app/api/benches/[id]/route";
import { POST as createReview } from "@/app/api/benches/[id]/reviews/route";
import { DELETE as deleteReview } from "@/app/api/reviews/[id]/route";
import { POST as likeReview } from "@/app/api/reviews/[id]/like/route";

const ADMIN = { "x-admin-key": "test-admin-key" };

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const withMethod = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe("API скамеек", () => {
  let benchId = 0;
  let reviewId = 0;

  it("создаёт скамейку с первой рецензией и отфильтрованными тегами", async () => {
    // без фото обычный посетитель попал бы на модерацию — создаём от имени админа
    const res = await createBench(
      json({
        title: "  У пруда  ",
        lat: 59.93,
        lng: 30.33,
        rating: 4,
        reviewText: "Хорошо",
        tags: ["water", "shade", "unknown", "shade"],
      }, ADMIN),
    );
    expect(res.status).toBe(201);
    const bench = await res.json();
    expect(bench.title).toBe("У пруда");
    expect(bench.createdBy).toBe("Аноним");
    expect(bench.tags).toEqual(["shade", "water"]);
    expect(bench.reviewCount).toBe(1);
    expect(bench.avgRating).toBe(4);
    expect(bench.status).toBe("approved");
    benchId = bench.id;
  });

  it("отклоняет скамейку без названия и с неверными координатами", async () => {
    expect((await createBench(json({ title: "", lat: 1, lng: 1 }))).status).toBe(400);
    expect((await createBench(json({ title: "X", lat: 200, lng: 1 }))).status).toBe(400);
  });

  it("отдаёт список и карточку с рецензиями", async () => {
    const list = await (await listBenches(new Request("http://test"))).json();
    expect(list.some((b: { id: number }) => b.id === benchId)).toBe(true);

    const details = await (await getBench(new Request("http://test"), ctx(benchId))).json();
    expect(details.reviews).toHaveLength(1);
    expect(details.reviews[0].likes).toBe(0);
    reviewId = details.reviews[0].id;
  });

  it("404 для несуществующей скамейки", async () => {
    expect((await getBench(new Request("http://test"), ctx(99999))).status).toBe(404);
  });

  it("добавляет рецензию и проверяет оценку", async () => {
    expect((await createReview(json({ rating: 9, text: "x" }), ctx(benchId))).status).toBe(400);
    expect((await createReview(json({ rating: 5, text: "" }), ctx(benchId))).status).toBe(400);
    const res = await createReview(json({ rating: 2, text: "Сломана доска" }), ctx(benchId));
    expect(res.status).toBe(201);
    const details = await (await getBench(new Request("http://test"), ctx(benchId))).json();
    expect(details.reviewCount).toBe(2);
    expect(details.avgRating).toBe(3);
  });

  it("лайк и снятие лайка рецензии, счётчик не уходит в минус", async () => {
    expect(await (await likeReview(json({}), ctx(reviewId))).json()).toMatchObject({ likes: 1 });
    expect(await (await likeReview(json({ delta: -1 }), ctx(reviewId))).json()).toMatchObject({
      likes: 0,
    });
    expect(await (await likeReview(json({ delta: -1 }), ctx(reviewId))).json()).toMatchObject({
      likes: 0,
    });
    expect((await likeReview(json({}), ctx(99999))).status).toBe(404);
  });

  it("редактирование и удаление — только с ключом админа", async () => {
    expect((await patchBench(withMethod("PATCH", { title: "Новое" }), ctx(benchId))).status).toBe(
      401,
    );
    expect(
      (await patchBench(withMethod("PATCH", { title: "Новое" }, { "x-admin-key": "wrong" }), ctx(benchId)))
        .status,
    ).toBe(401);

    const patched = await patchBench(
      withMethod("PATCH", { title: "Новое", tags: ["quiet"] }, ADMIN),
      ctx(benchId),
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ title: "Новое", tags: ["quiet"] });

    expect((await deleteReview(withMethod("DELETE"), ctx(reviewId))).status).toBe(401);
    expect((await deleteReview(withMethod("DELETE", undefined, ADMIN), ctx(reviewId))).status).toBe(
      200,
    );

    expect((await deleteBench(withMethod("DELETE"), ctx(benchId))).status).toBe(401);
    expect((await deleteBench(withMethod("DELETE", undefined, ADMIN), ctx(benchId))).status).toBe(
      200,
    );
    expect((await getBench(new Request("http://test"), ctx(benchId))).status).toBe(404);
  });

  describe("модерация по фото", () => {
    const upload = (photo: string, headers: Record<string, string> = {}) => {
      const fd = new FormData();
      fd.append("title", "Фото-тест");
      fd.append("lat", "55.7");
      fd.append("lng", "37.6");
      fd.append("benchPhoto", new File([photo], "b.jpg", { type: "image/jpeg" }));
      fd.append("viewPhoto", new File(["VIEW"], "v.jpg", { type: "image/jpeg" }));
      return createBench(new Request("http://test", { method: "POST", body: fd, headers }));
    };

    it("похоже на скамейку — сразу на карте", async () => {
      const bench = await (await upload("BENCH")).json();
      expect(bench).toMatchObject({ status: "approved", photoScore: 0.97 });
      const list = await (await listBenches(new Request("http://test"))).json();
      expect(list.some((b: { id: number }) => b.id === bench.id)).toBe(true);
    });

    it("не похоже — на проверке: скрыта от всех, кроме админа, пока её не одобрят", async () => {
      const bench = await (await upload("CAT")).json();
      expect(bench).toMatchObject({ status: "pending", photoScore: 0.03 });

      const pub = await (await listBenches(new Request("http://test"))).json();
      expect(pub.some((b: { id: number }) => b.id === bench.id)).toBe(false);
      expect((await getBench(new Request("http://test"), ctx(bench.id))).status).toBe(404);
      expect((await createReview(json({ rating: 5, text: "x" }), ctx(bench.id))).status).toBe(404);

      const admin = await (await listBenches(new Request("http://test", { headers: ADMIN }))).json();
      expect(admin.find((b: { id: number }) => b.id === bench.id)?.status).toBe("pending");

      // одобрить может только админ
      expect((await patchBench(withMethod("PATCH", { status: "approved" }), ctx(bench.id))).status).toBe(401);
      const ok = await patchBench(withMethod("PATCH", { status: "approved" }, ADMIN), ctx(bench.id));
      expect(ok.status).toBe(200);
      expect((await ok.json()).title).toBe("Фото-тест"); // название не стёрлось
      expect((await getBench(new Request("http://test"), ctx(bench.id))).status).toBe(200);
    });

    it("админ публикует сразу, даже если фото не похоже", async () => {
      const bench = await (await upload("CAT", ADMIN)).json();
      expect(bench.status).toBe("approved");
    });

    it("без фото (запрос к API напрямую) — на проверку", async () => {
      const bench = await (await createBench(json({ title: "Без фото", lat: 1, lng: 1 }))).json();
      expect(bench.status).toBe("pending");
    });
  });
});
