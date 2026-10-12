#!/usr/bin/env node
// Импорт фото из public/uploads в таблицу photos указанной базы данных.
// Идемпотентно: уже существующие записи пропускаются.
//
// Перед запуском таблица photos должна существовать (drizzle-kit push).
//
// Использование:
//   node scripts/import-uploads.mjs                          # локальная БД из .env
//   node scripts/import-uploads.mjs "postgresql://..."       # указанная БД (например, Neon)

import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const EXT_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

function resolveUrl() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(".env", "utf8");
    const m = env.match(/^DATABASE_URL=(.*)$/m);
    if (m) return m[1].trim();
  } catch {
    // .env отсутствует — сообщим об ошибке ниже
  }
  console.error("Не задан URL базы данных: передайте его аргументом или через DATABASE_URL");
  process.exit(1);
}

const url = resolveUrl();
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url);
const pool = new Pool({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const dir = join(process.cwd(), "public", "uploads");
if (!existsSync(dir)) {
  console.log("public/uploads не найден — импортировать нечего.");
  process.exit(0);
}

const files = (await readdir(dir)).filter((f) => {
  const ext = f.split(".").pop()?.toLowerCase();
  return ext && ext in EXT_MIME;
});

let imported = 0;
let skipped = 0;
for (const filename of files) {
  const ext = filename.split(".").pop().toLowerCase();
  const data = (await readFile(join(dir, filename))).toString("base64");
  const res = await pool.query(
    "insert into photos (filename, mime, data) values ($1, $2, $3) on conflict (filename) do nothing",
    [filename, EXT_MIME[ext], data],
  );
  if (res.rowCount > 0) imported++;
  else skipped++;
}

console.log(`Импорт фото завершён: добавлено ${imported}, уже было ${skipped}, файлов на диске ${files.length}.`);
await pool.end();
