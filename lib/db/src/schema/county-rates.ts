import { integer, numeric, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { countiesTable } from "./counties";

/**
 * CMS Medicare Advantage county-level monthly capitation benchmarks.
 *
 * CMS publishes a county rate code that is distinct from the county FIPS code
 * used by the app, so both identifiers are retained.
 */
export const countyRatesTable = pgTable(
  "county_rates",
  {
    county_fips: text("county_fips")
      .notNull()
      .references(() => countiesTable.fips, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    cms_county_code: text("cms_county_code").notNull(),
    rate_5_star: numeric("rate_5_star", { precision: 10, scale: 2 }).notNull(),
    rate_3_5_star: numeric("rate_3_5_star", {
      precision: 10,
      scale: 2,
    }).notNull(),
    rate_0_star: numeric("rate_0_star", { precision: 10, scale: 2 }).notNull(),
    esrd_rate: numeric("esrd_rate", { precision: 10, scale: 2 }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.county_fips, table.year] })],
);

export type CountyRate = typeof countyRatesTable.$inferSelect;
export type InsertCountyRate = typeof countyRatesTable.$inferInsert;