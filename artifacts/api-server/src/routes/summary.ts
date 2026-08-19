import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  GetSummaryQueryParams,
  GetSummaryResponse,
  GetTopPlansQueryParams,
  GetTopPlansResponse,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/summary", async (req, res): Promise<void> => {
  const query = GetSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { state_code, year } = query.data ?? {};

  const stateFilter = state_code
    ? sql`AND c.state_code = ${state_code}`
    : sql``;
  const yearFilter = year ? sql`AND e.year = ${year}` : sql``;

  const overallResult = await db.execute(sql`
    SELECT
      COUNT(DISTINCT p.id) AS total_plans,
      COALESCE(SUM(e.beneficiary_count), 0) AS total_beneficiaries,
      COUNT(DISTINCT e.county_fips) AS total_counties,
      COUNT(DISTINCT p.sponsor_name) AS total_sponsors,
      AVG(p.monthly_premium::float) AS avg_premium,
      AVG(p.moop::float) AS avg_moop,
      COALESCE(MAX(e.year), ${year ?? 2025}) AS year
    FROM plans p
    LEFT JOIN enrollments e ON e.plan_id = p.id
    LEFT JOIN counties c ON c.fips = e.county_fips
    WHERE 1=1 ${stateFilter} ${yearFilter}
  `);

  const overall = overallResult.rows[0] as any;
  const totalBeneficiaries = Number(overall.total_beneficiaries) || 1;

  const byTypeResult = await db.execute(sql`
    SELECT
      p.plan_type,
      COUNT(DISTINCT p.id) AS plan_count,
      COALESCE(SUM(e.beneficiary_count), 0) AS beneficiary_count
    FROM plans p
    LEFT JOIN enrollments e ON e.plan_id = p.id
    LEFT JOIN counties c ON c.fips = e.county_fips
    WHERE 1=1 ${stateFilter} ${yearFilter}
    GROUP BY p.plan_type
    ORDER BY beneficiary_count DESC
  `);

  const by_plan_type = (byTypeResult.rows as any[]).map((r) => ({
    plan_type: r.plan_type,
    plan_count: Number(r.plan_count),
    beneficiary_count: Number(r.beneficiary_count),
    pct_of_total: totalBeneficiaries > 0
      ? Math.round((Number(r.beneficiary_count) / totalBeneficiaries) * 10000) / 100
      : 0,
  }));

  const summary = {
    total_plans: Number(overall.total_plans),
    total_beneficiaries: Number(overall.total_beneficiaries),
    total_counties: Number(overall.total_counties),
    total_sponsors: Number(overall.total_sponsors),
    avg_premium: overall.avg_premium != null ? Number(overall.avg_premium) : null,
    avg_moop: overall.avg_moop != null ? Number(overall.avg_moop) : null,
    year: Number(overall.year),
    by_plan_type,
  };

  res.json(GetSummaryResponse.parse(summary));
});

router.get("/summary/top-plans", async (req, res): Promise<void> => {
  const query = GetTopPlansQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { state_code, plan_type, year, limit = 10 } = query.data ?? {};

  const stateFilter = state_code
    ? sql`AND c.state_code = ${state_code}`
    : sql``;
  const typeFilter = plan_type ? sql`AND p.plan_type = ${plan_type}` : sql``;
  const yearFilter = year ? sql`AND e.year = ${year}` : sql``;

  const result = await db.execute(sql`
    SELECT
      p.id,
      p.contract_id,
      p.plan_name,
      p.sponsor_name,
      p.plan_type,
      p.monthly_premium::float,
      p.star_rating::float,
      COALESCE(SUM(e.beneficiary_count), 0) AS total_beneficiaries,
      COUNT(DISTINCT e.county_fips) AS county_count,
      COALESCE(MAX(e.year), p.year) AS year
    FROM plans p
    LEFT JOIN enrollments e ON e.plan_id = p.id
    LEFT JOIN counties c ON c.fips = e.county_fips
    WHERE 1=1 ${stateFilter} ${typeFilter} ${yearFilter}
    GROUP BY p.id
    ORDER BY total_beneficiaries DESC
    LIMIT ${limit}
  `);

  const topPlans = (result.rows as any[]).map((r) => ({
    id: Number(r.id),
    contract_id: r.contract_id,
    plan_name: r.plan_name,
    sponsor_name: r.sponsor_name,
    plan_type: r.plan_type,
    monthly_premium: r.monthly_premium != null ? Number(r.monthly_premium) : null,
    star_rating: r.star_rating != null ? Number(r.star_rating) : null,
    total_beneficiaries: Number(r.total_beneficiaries),
    county_count: Number(r.county_count),
    year: Number(r.year),
  }));

  res.json(GetTopPlansResponse.parse(topPlans));
});

export default router;
