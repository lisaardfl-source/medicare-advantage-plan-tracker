import { pgTable, serial, text, boolean, integer } from "drizzle-orm/pg-core";
import { plansTable } from "./plans";

export const benefitsTable = pgTable("benefits", {
  id: serial("id").primaryKey(),
  plan_id: integer("plan_id")
    .notNull()
    .references(() => plansTable.id, { onDelete: "cascade" }),
  benefit_name: text("benefit_name").notNull(),
  benefit_category: text("benefit_category").notNull(),
  benefit_value: text("benefit_value"),
  is_attributed: boolean("is_attributed").notNull().default(false),
});

export type Benefit = typeof benefitsTable.$inferSelect;
export type InsertBenefit = typeof benefitsTable.$inferInsert;
