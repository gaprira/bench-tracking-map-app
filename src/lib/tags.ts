// Удобства скамейки. id хранится в БД (benches.tags), label — в интерфейсе.
// Список общий для сервера (валидация) и клиента (чипы, фильтр).
export const BENCH_TAGS = [
  { id: "shade", label: "Тень" },
  { id: "backrest", label: "Со спинкой" },
  { id: "bin", label: "Урна рядом" },
  { id: "water", label: "Вид на воду" },
  { id: "view", label: "Красивый вид" },
  { id: "quiet", label: "Тихо" },
  { id: "lit", label: "Освещение" },
  { id: "covered", label: "Под навесом" },
] as const;

export type BenchTagId = (typeof BENCH_TAGS)[number]["id"];

const KNOWN = new Set<string>(BENCH_TAGS.map((t) => t.id));

/** Оставляет только известные теги, без повторов, в порядке BENCH_TAGS */
export function normalizeTags(input: unknown): BenchTagId[] {
  const list = Array.isArray(input) ? input : [];
  const picked = new Set(list.filter((t): t is string => typeof t === "string" && KNOWN.has(t)));
  return BENCH_TAGS.map((t) => t.id).filter((id) => picked.has(id));
}

export function tagLabel(id: string): string {
  return BENCH_TAGS.find((t) => t.id === id)?.label ?? id;
}
