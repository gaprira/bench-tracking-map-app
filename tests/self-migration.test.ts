import { describe, expect, it, vi } from "vitest";
import { newDb } from "pg-mem";

// Настоящий драйвер pg подменяем на pg-mem: БД в памяти со СТАРОЙ схемой
// (без benches.tags и reviews.likes), как в облаке до деплоя.
const mem = newDb();
mem.public.none(`
  CREATE TABLE benches (
    id serial primary key, title varchar(120) not null, description text,
    lat double precision not null, lng double precision not null,
    created_by varchar(80) not null default 'Аноним',
    bench_photo text, view_photo text, created_at timestamptz not null default now()
  );
  CREATE TABLE reviews (
    id serial primary key, bench_id integer not null references benches(id) on delete cascade,
    author varchar(80) not null default 'Аноним', rating integer not null, text text not null,
    created_at timestamptz not null default now()
  );
  INSERT INTO benches (title, lat, lng) VALUES ('Старая', 55.7, 37.6);
  INSERT INTO reviews (bench_id, rating, text) VALUES (1, 4, 'ок');
`);

vi.mock("pg", () => {
  const { Pool } = mem.adapters.createPg();
  return { Pool, default: { Pool } };
});

describe("самомиграция облачной базы", () => {
  it("добавляет недостающие колонки, старые данные на месте", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@example.neon.tech/db");
    const { pool } = await import("@/db");
    // любой запрос ждёт окончания самопроверки схемы
    await pool!.query("SELECT 1");
    expect(mem.public.many("SELECT title, tags FROM benches")).toEqual([
      { title: "Старая", tags: [] },
    ]);
    expect(mem.public.many("SELECT text, likes FROM reviews")).toEqual([{ text: "ок", likes: 0 }]);
    expect(mem.public.many("SELECT status, photo_score FROM benches")).toEqual([
      { status: "approved", photo_score: null },
    ]);
  });
});
