// Добавляет в базу колонки для тегов скамеек и лайков рецензий.
// Безопасно запускать повторно (IF NOT EXISTS), существующие данные не трогает.
//
// Запуск против облачной базы (адрес берётся из файла с DATABASE_URL):
//   node scripts/migrate-tags-likes.mjs .env.vercel
import { readFileSync } from "node:fs";
import pg from "pg";

const envFile = process.argv[2] ?? ".env";
const line = readFileSync(envFile, "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("DATABASE_URL="));
if (!line) {
  console.error(`В ${envFile} нет DATABASE_URL`);
  process.exit(1);
}
const url = line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url);

const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(
    `ALTER TABLE benches ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[]`,
  );
  await client.query(
    `ALTER TABLE reviews ADD COLUMN IF NOT EXISTS likes integer NOT NULL DEFAULT 0`,
  );
  const { rows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE (table_name = 'benches' AND column_name = 'tags')
        OR (table_name = 'reviews' AND column_name = 'likes')`,
  );
  console.log("Колонки на месте:", rows.map((r) => `${r.table_name}.${r.column_name}`).join(", "));
} finally {
  await client.end();
}
