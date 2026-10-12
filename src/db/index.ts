import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns, getTableName } from "drizzle-orm";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

let pool: Pool | undefined;
let db: any;

if (!databaseUrl) {
  // Мок-режим: DATABASE_URL не задан — работаем на таблицах в памяти,
  // эмулируя drizzle-запросы (select/where/orderBy/insert/delete + агрегаты).
  type MockRow = Record<string, any>;

  const mockTables = new Map<string, MockRow[]>();
  const mockIdCounters = new Map<string, number>();

  const tableRows = (table: string): MockRow[] => {
    if (!mockTables.has(table)) mockTables.set(table, []);
    return mockTables.get(table)!;
  };

  const nextId = (table: string): number => {
    const n = (mockIdCounters.get(table) ?? 0) + 1;
    mockIdCounters.set(table, n);
    return n;
  };

  const isColumn = (c: any) => !!c && typeof c === "object" && "name" in c && "table" in c;
  const isParam = (c: any) => !!c && typeof c === "object" && "value" in c && "encoder" in c;
  const chunks = (x: any): any[] => (Array.isArray(x?.queryChunks) ? x.queryChunks : []);
  const sqlText = (x: any): string =>
    chunks(x)
      .filter((c: any) => !isColumn(c) && !isParam(c))
      .map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : String(c?.value ?? "")))
      .join("");

  // JS-имя колонки (напр. benchId) по объекту колонки (у колонки .name — имя в БД: bench_id)
  const jsKey = (col: any): string => {
    try {
      const cols = getTableColumns(col.table) as Record<string, any>;
      for (const [key, c] of Object.entries(cols)) if (c === col) return key;
    } catch {
      // ignore
    }
    return col?.name;
  };

  // eq(col, value) -> { key, value }
  const parseEq = (clause: any): { key: string; value: any } | null => {
    const col = chunks(clause).find(isColumn);
    const param = chunks(clause).find(isParam);
    if (!col || !param) return null;
    return { key: jsKey(col), value: param.value };
  };

  // desc(col)/asc(col) -> { key, dir }
  const parseOrder = (expr: any): { key: string; dir: number } | null => {
    const col = chunks(expr).find(isColumn);
    if (!col) return null;
    return { key: jsKey(col), dir: /desc/i.test(sqlText(expr)) ? -1 : 1 };
  };

  const isAgg = (expr: any): "count" | "avg" | null => {
    const text = sqlText(expr);
    if (/\bcount\s*\(/i.test(text)) return "count";
    if (/\bavg\s*\(/i.test(text)) return "avg";
    return null;
  };

  const reviewsOf = (benchId: number): MockRow[] =>
    tableRows("reviews").filter((r) => r.benchId === benchId);

  const avgRatingOf = (rows: MockRow[]): number | null => {
    if (rows.length === 0) return null;
    return rows.reduce((sum, r) => sum + r.rating, 0) / rows.length;
  };

  class MockQueryBuilder {
    private _table = "";
    private _method = "";
    private _fields: Record<string, any> | undefined;
    private _values: MockRow = {};
    private _conditions: { key: string; value: any }[] = [];
    private _order: { key: string; dir: number }[] = [];

    select(fields?: Record<string, any>) {
      this._method = "select";
      this._fields = fields;
      return this;
    }

    from(table: any) {
      this._table = getTableName(table);
      return this;
    }

    leftJoin() {
      return this; // соединение не нужно: агрегаты считаем сами
    }

    groupBy() {
      return this;
    }

    orderBy(...exprs: any[]) {
      for (const expr of exprs) {
        const o = parseOrder(expr);
        if (o) this._order.push(o);
      }
      return this;
    }

    insert(table: any) {
      this._method = "insert";
      this._table = getTableName(table);
      return this;
    }

    values(vals: MockRow) {
      this._values = vals;
      return this;
    }

    delete(table: any) {
      this._method = "delete";
      this._table = getTableName(table);
      return this;
    }

    update(table: any) {
      this._method = "update";
      this._table = getTableName(table);
      return this;
    }

    set(vals: MockRow) {
      this._values = vals;
      return this;
    }

    where(clause: any) {
      const c = parseEq(clause);
      if (c) this._conditions.push(c);
      return this;
    }

    private _matches(row: MockRow): boolean {
      return this._conditions.every((c) => row[c.key] === c.value);
    }

    private _sort(rows: MockRow[]): MockRow[] {
      for (const o of this._order) {
        rows.sort((a, b) => {
          const av = a[o.key];
          const bv = b[o.key];
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * o.dir;
        });
      }
      return rows;
    }

    private async _execute(): Promise<any[]> {
      const rows = tableRows(this._table);

      if (this._method === "insert") {
        const row: MockRow = { ...this._values, id: nextId(this._table) };
        if (!row.createdAt) row.createdAt = new Date();
        rows.push(row);
        return [row];
      }

      if (this._method === "update") {
        const matched = rows.filter((r) => this._matches(r));
        for (const r of matched) {
          Object.assign(r, this._values);
        }
        return matched;
      }

      if (this._method === "delete") {
        const removed = rows.filter((r) => this._matches(r));
        for (const r of removed) {
          rows.splice(rows.indexOf(r), 1);
          if (this._table === "benches") {
            // cascade: удаляем скамейку вместе с рецензиями
            const benchReviews = reviewsOf(r.id);
            const reviewRows = tableRows("reviews");
            for (const rev of benchReviews) {
              reviewRows.splice(reviewRows.indexOf(rev), 1);
            }
          }
        }
        return removed;
      }

      // select
      let result = rows.filter((r) => this._matches(r));

      const hasAgg = this._fields
        ? Object.values(this._fields).some((v) => isAgg(v) !== null)
        : false;

      // Чистый агрегатный select без groupBy (сводка по reviews) -> один ряд
      if (this._table === "reviews" && hasAgg) {
        const summary: MockRow = {};
        for (const [key, expr] of Object.entries(this._fields!)) {
          const kind = isAgg(expr);
          if (kind === "count") {
            summary[key] = result.length;
          } else if (kind === "avg") {
            const col = chunks(expr).find(isColumn);
            const k = col ? jsKey(col) : "rating";
            summary[key] = avgRatingOf(result.map((r) => ({ ...r, rating: r[k] })));
          }
        }
        return [summary];
      }

      // К скамейкам добавляем счётчик и среднюю оценку (аналог leftJoin + groupBy)
      if (this._table === "benches") {
        result = result.map((b) => {
          const benchReviews = reviewsOf(b.id);
          return {
            ...b,
            reviewCount: benchReviews.length,
            avgRating: avgRatingOf(benchReviews),
          };
        });
      }

      return this._sort(result);
    }

    async returning() {
      return this._execute();
    }

    then(onFulfilled: any, onRejected: any) {
      return this._execute().then(onFulfilled, onRejected);
    }

    catch(onRejected: any) {
      return this._execute().then(undefined, onRejected);
    }
  }

  class MockDb {
    select(fields?: Record<string, any>) {
      return new MockQueryBuilder().select(fields);
    }

    insert(table: any) {
      return new MockQueryBuilder().insert(table);
    }

    delete(table: any) {
      return new MockQueryBuilder().delete(table);
    }

    update(table: any) {
      return new MockQueryBuilder().update(table);
    }

    async execute() {
      return { rows: [] };
    }
  }

  db = new MockDb();
} else {
  const globalForDb = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };
  // Облачный Postgres (Neon и т.п.) требует SSL; локальный — нет.
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])/.test(databaseUrl);
  pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 5,
  });
  if (process.env.NODE_ENV !== "production") { globalForDb.__arenaNextJsPostgresqlPool = pool; }
  db = drizzle(pool);
}

export { db, pool };
