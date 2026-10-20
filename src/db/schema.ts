import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const benches = pgTable("benches", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  createdBy: varchar("created_by", { length: 80 }).notNull().default("Аноним"),
  benchPhoto: text("bench_photo"),
  viewPhoto: text("view_photo"),
  // id удобств из src/lib/tags.ts
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  benchId: integer("bench_id")
    .notNull()
    .references(() => benches.id, { onDelete: "cascade" }),
  author: varchar("author", { length: 80 }).notNull().default("Аноним"),
  rating: integer("rating").notNull(),
  text: text("text").notNull(),
  // «Полезно»: счётчик без аккаунтов, повторы отсекает браузер (localStorage)
  likes: integer("likes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const benchesRelations = relations(benches, ({ many }) => ({
  reviews: many(reviews),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  bench: one(benches, { fields: [reviews.benchId], references: [benches.id] }),
}));

// Фото хранятся в базе (base64): на Vercel файловая система
// доступна только для чтения, public/uploads там не работает.
export const photos = pgTable("photos", {
  filename: varchar("filename", { length: 100 }).primaryKey(),
  mime: varchar("mime", { length: 40 }).notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Bench = typeof benches.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Photo = typeof photos.$inferSelect;
