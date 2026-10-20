import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Пустой DATABASE_URL включает мок-базу в памяти (src/db/index.ts)
    env: { DATABASE_URL: "", ADMIN_KEY: "test-admin-key" },
    // Мок-база общая на файл — тесты внутри файла идут по порядку
    sequence: { concurrent: false },
  },
});
