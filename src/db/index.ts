import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

let pool: Pool | undefined;
let db: any;

if (!databaseUrl) {
  let mockBenches: any[] = [];
  let mockReviews: any[] = [];
  let benchIdCounter = 1;
  let reviewIdCounter = 1;

  class MockQueryBuilder {
    private _tableName: string = "";
    private _method: string = "";
    private _values: any = {};
    private _whereClause: any = null;

    select() { this._method = "select"; return this; }
    from(table: any) { this._tableName = table?.name || table?._?.name || "benches"; return this; }
    leftJoin() { return this; }
    groupBy() { return this; }
    orderBy() { return this; }
    insert(table: any) { this._method = "insert"; this._tableName = table?.name || table?._?.name || "benches"; return this; }
    values(vals: any) { this._values = vals; return this; }
    where(clause: any) { this._whereClause = clause; return this; }

    async returning() {
      if (this._method === "insert" && this._tableName === "benches") {
        const newBench = {
          id: benchIdCounter++,
          title: this._values.title,
          description: this._values.description ?? null,
          lat: this._values.lat,
          lng: this._values.lng,
          createdBy: this._values.createdBy,
          benchPhoto: this._values.benchPhoto ?? null,
          viewPhoto: this._values.viewPhoto ?? null,
          createdAt: new Date(),
        };
        mockBenches.push(newBench);
        return [newBench];
      }
      if (this._method === "insert" && this._tableName === "reviews") {
        const newReview = {
          id: reviewIdCounter++,
          benchId: this._values.benchId,
          author: this._values.author,
          rating: this._values.rating,
          text: this._values.text,
          createdAt: new Date(),
        };
        mockReviews.push(newReview);
        return [newReview];
      }
      return [{}];
    }

    then(resolve: any) {
      if (this._method === "select") {
        if (this._tableName === "benches") {
          let results = [...mockBenches];
          if (this._whereClause) {
            // Simplified where handling
          }
          // Simulate join with reviews
          results = results.map(b => ({
            ...b,
            reviewCount: mockReviews.filter(r => r.benchId === b.id).length,
            avgRating: mockReviews.filter(r => r.benchId === b.id).length > 0
              ? mockReviews.filter(r => r.benchId === b.id).reduce((sum, r) => sum + r.rating, 0) / mockReviews.filter(r => r.benchId === b.id).length
              : null,
          }));
          resolve(results);
        } else if (this._tableName === "reviews") {
          let results = [...mockReviews];
          if (this._whereClause) {
            // Simplified where handling
          }
          resolve(results);
        } else {
          resolve([]);
        }
      } else {
        resolve([]);
      }
    }

    catch() { return this; }
  }

  const mockDb = new MockQueryBuilder();
  (globalThis as any).db = mockDb;
  db = mockDb;
} else {
  const globalForDb = globalThis as typeof globalThis & { __arenaNextJsPostgresqlPool?: Pool };
  pool = globalForDb.__arenaNextJsPostgresqlPool ?? new Pool({ connectionString: databaseUrl });
  if (process.env.NODE_ENV !== "production") { globalForDb.__arenaNextJsPostgresqlPool = pool; }
  db = drizzle(pool);
}

export { db, pool };
