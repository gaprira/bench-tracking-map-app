#!/usr/bin/env node
// Миграция скамеек и рецензий из локальной базы в облачную (например, Neon).
// Сохраняет id и даты; идемпотентно (повторный запуск ничего не дублирует).
// Фото переносится отдельно: node scripts/import-uploads.mjs "<TARGET_URL>"
//
// Использование:
//   node scripts/migrate-to-hosted.mjs "postgresql://..."   # URL целевой облачной БД
// Источник: LOCAL_DATABASE_URL, .env DATABASE_URL или локальная база по умолчанию.

import { Pool } from "pg";
import { readFileSync } from "node:fs";

function localUrl() {
  if (process.env.LOCAL_DATABASE_URL) return process.env.LOCAL_DATABASE_URL;
  try {
    const env = readFileSync(".env", "utf8");
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim();
  } catch {
    // .env отсутствует — используем значение по умолчанию
  }
  return "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
}

const targetUrl = process.argv[2];
if (!targetUrl) {
  console.error('Укажите URL облачной БД: node scripts/migrate-to-hosted.mjs "postgresql://..."');
  process.exit(1);
}

const local = new Pool({ connectionString: localUrl() });
const remote = new Pool({ connectionString: targetUrl, ssl: { rejectUnauthorized: false } });

const benches = (await local.query("select * from benches order by id")).rows;
const reviews = (await local.query("select * from reviews order by id")).rows;

for (const b of benches) {
  await remote.query(
    `insert into benches (id, title, description, lat, lng, created_by, bench_photo, view_photo, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (id) do nothing`,
    [b.id, b.title, b.description, b.lat, b.lng, b.created_by, b.bench_photo, b.view_photo, b.created_at],
  );
}

for (const r of reviews) {
  await remote.query(
    `insert into reviews (id, bench_id, author, rating, text, created_at)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (id) do nothing`,
    [r.id, r.bench_id, r.author, r.rating, r.text, r.created_at],
  );
}

// Синхронизируем последовательности id с перенесёнными данными,
// чтобы новые записи не конфликтовали со старыми id.
const syncSeq = async (table) => {
  const { rows } = await remote.query(`select coalesce(max(id), 0) as max from ${table}`);
  const max = rows[0].max;
  if (max > 0) {
    await remote.query("select setval(pg_get_serial_sequence($1, 'id'), $2)", [table, max]);
  } else {
    await remote.query("select setval(pg_get_serial_sequence($1, 'id'), 1, false)", [table]);
  }
};
await syncSeq("benches");
await syncSeq("reviews");

console.log(`Миграция завершена: скамеек ${benches.length}, рецензий ${reviews.length}.`);
console.log(`Теперь перенесите фото:\n  node scripts/import-uploads.mjs "${targetUrl}"`);
await local.end();
await remote.end();
