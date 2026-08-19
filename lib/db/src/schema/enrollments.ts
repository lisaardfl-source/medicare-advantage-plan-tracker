import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { plansTable } from "./plans";
import { countiesTable } from "./counties";

export const enrollmentsTable = pgTable("enrollments", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id")
    .notNull()
    .references(() => plansTable.id, { onDelete: "cascade" }),
  county_fips: text("county_fips")
    .notNull()
    .references(() => countiesTable.fips),
  beneficiary_count: integer("beneficiary_count").notNull(),
  year: integer("year").notNull(),
});

export type Enrollment = typeof enrollmentsTable.$inferSelect;
export type InsertEnrollment = typeof enrollmentsTable.$inferInsert;
