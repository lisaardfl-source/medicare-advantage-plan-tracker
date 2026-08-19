import { pgTable, text } from "drizzle-orm/pg-core";

export const countiesTable = pgTable("counties", {
  fips: text("fips").primaryKey(),
  county_name: text("county_name").notNull(),
  state_code: text("state_code").notNull(),
  state_name: text("state_name").notNull(),
});

export type County = typeof countiesTable.$inferSelect;
export type InsertCounty = typeof countiesTable.$inferInsert;
