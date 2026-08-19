import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const planTypeEnum = pgEnum("plan_type", [
  "d_snp",
  "i_snp",
  "c_snp",
  "regular",
]);

export const plansTable = pgTable("plans", {
  id: serial("id").primaryKey(),
  contract_id: text("contract_id").notNull(),
  plan_id: text("plan_id").notNull(),
  plan_name: text("plan_name").notNull(),
  sponsor_name: text("sponsor_name").notNull(),
  plan_type: planTypeEnum("plan_type").notNull(),
  monthly_premium: numeric("monthly_premium", { precision: 10, scale: 2 }),
  monthly_premium_min: numeric("monthly_premium_min", { precision: 10, scale: 2 }),
  monthly_premium_max: numeric("monthly_premium_max", { precision: 10, scale: 2 }),
  drug_premium: numeric("drug_premium", { precision: 10, scale: 2 }),
  moop: numeric("moop", { precision: 10, scale: 2 }),
  moop_min: numeric("moop_min", { precision: 10, scale: 2 }),
  moop_max: numeric("moop_max", { precision: 10, scale: 2 }),
  moop_type: text("moop_type"),
  costs_vary_by_county: boolean("costs_vary_by_county").notNull().default(false),
  premium_varies_by_county: boolean("premium_varies_by_county").notNull().default(false),
  premium_has_unpublished_counties: boolean("premium_has_unpublished_counties").notNull().default(false),
  moop_varies_by_county: boolean("moop_varies_by_county").notNull().default(false),
  moop_has_unpublished_counties: boolean("moop_has_unpublished_counties").notNull().default(false),
  cost_source: text("cost_source"),
  cost_source_url: text("cost_source_url"),
  cost_imported_at: timestamp("cost_imported_at", { withTimezone: true }),
  star_rating: numeric("star_rating", { precision: 3, scale: 1 }),
  year: integer("year").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // D-SNP integration designations
  d_snp_integration: text("d_snp_integration"), // 'fide' | 'hide' | 'coordinated' | null
  frailty_eligible: boolean("frailty_eligible").notNull().default(false),
  is_look_alike: boolean("is_look_alike").notNull().default(false),
  dual_eligible_enrollment: integer("dual_eligible_enrollment"),
  look_alike_total_enrollment: integer("look_alike_total_enrollment"),
  dual_eligible_pct: numeric("dual_eligible_pct", { precision: 9, scale: 6 }),
  dual_eligible_data_status: text("dual_eligible_data_status")
    .notNull()
    .default("unknown"),
  dual_eligible_source_url: text("dual_eligible_source_url"),
  // Sponsor / contracting metadata
  parent_organization: text("parent_organization"),
  contract_effective_year: integer("contract_effective_year"),
  offers_part_d: boolean("offers_part_d"),
  // Granular star ratings
  star_rating_part_c: numeric("star_rating_part_c", { precision: 3, scale: 1 }),
  star_rating_part_d: numeric("star_rating_part_d", { precision: 3, scale: 1 }),
});

export type Plan = typeof plansTable.$inferSelect;
export type InsertPlan = typeof plansTable.$inferInsert;
