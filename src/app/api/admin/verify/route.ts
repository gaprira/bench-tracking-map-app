import { checkAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Проверка ключа администратора: фронтенд вызывает при входе в режиме админа.
export async function GET(request: Request) {
  return Response.json({ ok: checkAdmin(request) });
}
