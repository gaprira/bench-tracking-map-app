// Проверка ключа администратора (модератора) из заголовка x-admin-key.
// Ключ задаётся в .env переменной ADMIN_KEY.
// Если ADMIN_KEY не задан — модерация полностью отключена (все запросы отклоняются).
export function checkAdmin(request: Request): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  return request.headers.get("x-admin-key") === key;
}

export function adminDenied() {
  return Response.json(
    { error: "Это действие доступно только администратору" },
    { status: 401 },
  );
}
