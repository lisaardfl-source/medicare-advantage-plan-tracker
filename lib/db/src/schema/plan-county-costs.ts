import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { countiesTable } from "./counties";
import { plansTable } from "./plans";

export const planCountyCostsTable = pgTable(
  "plan_county_costs",
  {
    id: serial("id").primaryKey(),
    plan_id: integer("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "cascade" }),
    county_fips: text("county_fips")
      .notNull()
      .references(() => countiesTable.fips, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    segment_id: integer("segment_id").notNull(),
    monthly_premium: numeric("monthly_premium", { precision: 10, scale: 2 }),
    moop: numeric("moop", { precision: 10, scale: 2 }),
    moop_type: text("moop_type"),
    is_published: boolean("is_published").notNull().default(true),
    source: text("source").notNull(),
    source_url: text("source_url").notNull(),
    imported_at: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_county_costs_plan_county_year_idx").on(
      table.plan_id,
      table.county_fips,
      table.year,
    ),
  ],
);

export type PlanCountyCost = typeof planCountyCostsTable.$inferSelect;
export type InsertPlanCountyCost = typeof planCountyCostsTable.$inferInsert;