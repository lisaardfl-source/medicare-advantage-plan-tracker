import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  GetCountyMarketShareParams,
  GetCountyMarketShareQueryParams,
  GetCountyMarketShareResponse,
  GetCountyConcentrationQueryParams,
  GetCountyConcentrationResponse,
} from "@workspace/api-zod";
import { CONFIRMED_NO_2026_RATE } from "@workspace/cms-rate-reference";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/counties/:fips/market-share", async (req, res): Promise<void> => {
  const params = GetCountyMarketShareParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetCountyMarketShareQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { fips } = params.data;
  const { year } = query.data ?? {};

  // Verify county exists
  const countyResult = await db.execute(
    sql`SELECT fips, county_name, state_code, state_name FROM counties WHERE fips = ${fips}`
  );
  if (countyResult.rows.length === 0) {
    res.status(404).json({ error: "County not found" });
    return;
  }
  const county = countyResult.rows[0] as any;

  // Get all plans in this county with beneficiary counts
  const plansResult = await db.execute(sql`
    SELECT
      p.id AS plan_id,
      p.contract_id,
      p.plan_name,
      p.sponsor_name,
      p.plan_type,
      CASE WHEN pcc.id IS NOT NULL
        THEN pcc.monthly_premium::float
        ELSE p.monthly_premium::float
      END AS monthly_premium,
      CASE WHEN pcc.id IS NOT NULL
        THEN pcc.moop::float
        ELSE p.moop::float
      END AS moop,
      CASE WHEN pcc.id IS NOT NULL
        THEN pcc.source
        ELSE p.cost_source
      END AS cost_source,
      p.star_rating::float,
      p.star_rating_part_c::float,
      p.star_rating_part_d::float,
      p.d_snp_integration,
      p.frailty_eligible,
       p.is_look_alike,
       p.dual_eligible_enrollment,
       p.look_alike_total_enrollment,
       p.dual_eligible_pct::float,
       p.dual_eligible_data_status,
       p.dual_eligible_source_url,
      p.parent_organization,
      p.contract_effective_year,
      e.beneficiary_count,
      e.year
    FROM enrollments e
    JOIN plans p ON p.id = e.plan_id
    LEFT JOIN plan_county_costs pcc
      ON pcc.plan_id = p.id
      AND pcc.county_fips = e.county_fips
      AND pcc.year = e.year
    WHERE e.county_fips = ${fips}
    ${year ? sql`AND e.year = ${year}` : sql`AND e.year = (SELECT MAX(year) FROM enrollments WHERE county_fips = ${fips})`}
    ORDER BY e.beneficiary_count DESC
  `);

  const planRows = plansResult.rows as any[];
  const totalBeneficiaries = planRows.reduce(
    (sum, r) => sum + Number(r.beneficiary_count),
    0
  );

  // Compute market share % and HHI
  const plans = planRows.map((r) => {
    const count = Number(r.beneficiary_count);
    const pct = totalBeneficiaries > 0 ? (count / totalBeneficiaries) * 100 : 0;
    return {
      plan_id: Number(r.plan_id),
      contract_id: r.contract_id,
      plan_name: r.plan_name,
      sponsor_name: r.sponsor_name,
      plan_type: r.plan_type,
      monthly_premium: r.monthly_premium != null ? Number(r.monthly_premium) : null,
      moop: r.moop != null ? Number(r.moop) : null,
      cost_source: r.cost_source ?? null,
      star_rating: r.star_rating != null ? Number(r.star_rating) : null,
      d_snp_integration: r.d_snp_integration ?? null,
      frailty_eligible: Boolean(r.frailty_eligible),
       is_look_alike: Boolean(r.is_look_alike),
       dual_eligible_enrollment:
         r.dual_eligible_enrollment != null ? Number(r.dual_eligible_enrollment) : null,
       look_alike_total_enrollment:
         r.look_alike_total_enrollment != null ? Number(r.look_alike_total_enrollment) : null,
       dual_eligible_pct:
         r.dual_eligible_pct != null ? Number(r.dual_eligible_pct) : null,
       dual_eligible_data_status: r.dual_eligible_data_status ?? "unknown",
       dual_eligible_source_url: r.dual_eligible_source_url ?? null,
      parent_organization: r.parent_organization ?? null,
      star_rating_part_c: r.star_rating_part_c != null ? Number(r.star_rating_part_c) : null,
      star_rating_part_d: r.star_rating_part_d != null ? Number(r.star_rating_part_d) : null,
      contract_effective_year: r.contract_effective_year != null ? Number(r.contract_effective_year) : null,
      beneficiary_count: count,
      market_share_pct: Math.round(pct * 100) / 100,
      year: Number(r.year),
    };
  });

  // HHI = sum of squared market share percentages (scaled: each share as 0-100 → HHI 0-10000)
  const hhi = plans.reduce((sum, p) => sum + p.market_share_pct ** 2, 0);
  const top1Share = plans[0]?.market_share_pct ?? 0;
  const top2Share = (plans[0]?.market_share_pct ?? 0) + (plans[1]?.market_share_pct ?? 0);
  const isMonopoly = top1Share > 80;
  const isDuopoly = !isMonopoly && top2Share > 70;
  const effYear = plans[0]?.year ?? Number(year ?? new Date().getFullYear());
  const rateResult = await db.execute(sql`
    SELECT
      year,
      cms_county_code,
      rate_5_star::float,
      rate_3_5_star::float,
      rate_0_star::float,
      esrd_rate::float
    FROM county_rates
    WHERE county_fips = ${fips} AND year = ${effYear}
  `);
  const rate = rateResult.rows[0] as any | undefined;

  const result = {
    fips: county.fips,
    county_name: county.county_name,
    state_code: county.state_code,
    state_name: county.state_name,
    total_beneficiaries: totalBeneficiaries,
    plan_count: plans.length,
    hhi: Math.round(hhi),
    top1_share_pct: Math.round(top1Share * 100) / 100,
    top2_share_pct: Math.round(top2Share * 100) / 100,
    is_monopoly: isMonopoly,
    is_duopoly: isDuopoly,
    benchmark_unavailable_reason:
      rate || effYear !== 2026 ? null : (CONFIRMED_NO_2026_RATE[fips] ?? null),
    rate_benchmark: rate
      ? {
          year: Number(rate.year),
          cms_county_code: rate.cms_county_code,
          rate_5_star: Number(rate.rate_5_star),
          rate_3_5_star: Number(rate.rate_3_5_star),
          rate_0_star: Number(rate.rate_0_star),
          esrd_rate: Number(rate.esrd_rate),
        }
      : null,
    year: effYear,
    plans,
  };

  res.json(GetCountyMarketShareResponse.parse(result));
});

router.get("/summary/county-concentration", async (req, res): Promise<void> => {
  const query = GetCountyConcentrationQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { state_code, year, min_beneficiaries = 1000, limit = 100 } = query.data ?? {};

  // Resolve which year to use (default: latest available)
  const yearToUse = year
    ? year
    : (await db.execute(sql`SELECT MAX(year) AS y FROM enrollments`)).rows[0] as any;
  const resolvedYear = year ?? Number((yearToUse as any).y);

  const result = await db.execute(sql`
    WITH base AS (
      SELECT
        e.county_fips,
        e.plan_id,
        e.beneficiary_count,
        p.plan_name,
        p.sponsor_name,
        p.plan_type,
        p.d_snp_integration
      FROM enrollments e
      JOIN plans p ON p.id = e.plan_id
      JOIN counties c ON c.fips = e.county_fips
      WHERE e.year = ${resolvedYear}
      ${state_code ? sql`AND c.state_code = ${state_code}` : sql``}
    ),
    county_totals AS (
      SELECT
        county_fips,
        SUM(beneficiary_count) AS total_beneficiaries,
        COUNT(DISTINCT plan_id) AS plan_count
      FROM base
      GROUP BY county_fips
      HAVING SUM(beneficiary_count) >= ${min_beneficiaries ?? 1000}
    ),
    integration_counts AS (
      SELECT
        county_fips,
        COUNT(*) FILTER (WHERE plan_type = 'd_snp') AS d_snp_plans,
        COUNT(*) FILTER (WHERE d_snp_integration = 'fide') AS fide_plans,
        COUNT(*) FILTER (WHERE d_snp_integration = 'hide') AS hide_plans,
        COUNT(*) FILTER (WHERE d_snp_integration = 'coordinated') AS coordinated_plans
      FROM base
      GROUP BY county_fips
    ),
    ranked AS (
      SELECT
        b.county_fips,
        b.plan_name,
        b.sponsor_name,
        b.plan_type,
        b.beneficiary_count,
        ct.total_beneficiaries,
        ROW_NUMBER() OVER (PARTITION BY b.county_fips ORDER BY b.beneficiary_count DESC) AS rn
      FROM base b
      JOIN county_totals ct ON ct.county_fips = b.county_fips
    ),
    hhi_calc AS (
      SELECT
        county_fips,
        SUM(POWER((beneficiary_count::numeric / NULLIF(total_beneficiaries, 0)) * 100, 2)) AS hhi
      FROM ranked
      GROUP BY county_fips
    )
    SELECT
      c.fips,
      c.county_name,
      c.state_code,
      c.state_name,
      ct.total_beneficiaries,
      ct.plan_count,
       cr.year AS rate_year,
       cr.cms_county_code,
       cr.rate_5_star::float,
       cr.rate_3_5_star::float,
       cr.rate_0_star::float,
       cr.esrd_rate::float,
       ic.d_snp_plans,
       ic.fide_plans,
       ic.hide_plans,
       ic.coordinated_plans,
      ROUND(h.hhi) AS hhi,
      p1.plan_name   AS top1_plan_name,
      p1.sponsor_name AS top1_sponsor_name,
      p1.plan_type   AS top1_plan_type,
      ROUND((p1.beneficiary_count::numeric / NULLIF(ct.total_beneficiaries, 0)) * 100, 2) AS top1_share_pct,
      p2.plan_name   AS top2_plan_name,
      p2.sponsor_name AS top2_sponsor_name,
      ROUND((p2.beneficiary_count::numeric / NULLIF(ct.total_beneficiaries, 0)) * 100, 2) AS top2_share_pct,
      ROUND(
        ((COALESCE(p1.beneficiary_count, 0) + COALESCE(p2.beneficiary_count, 0))::numeric
          / NULLIF(ct.total_beneficiaries, 0)) * 100, 2
      ) AS top2_combined_pct,
      ${resolvedYear} AS year
    FROM county_totals ct
    JOIN counties c ON c.fips = ct.county_fips
    LEFT JOIN county_rates cr
      ON cr.county_fips = ct.county_fips AND cr.year = ${resolvedYear}
    JOIN integration_counts ic ON ic.county_fips = ct.county_fips
    JOIN hhi_calc h ON h.county_fips = ct.county_fips
    LEFT JOIN ranked p1 ON p1.county_fips = ct.county_fips AND p1.rn = 1
    LEFT JOIN ranked p2 ON p2.county_fips = ct.county_fips AND p2.rn = 2
    ORDER BY h.hhi DESC
    LIMIT ${limit}
  `);

  const rows = (result.rows as any[]).map((r) => {
    const top1Share = Number(r.top1_share_pct ?? 0);
    const top2Combined = Number(r.top2_combined_pct ?? 0);
    return {
      fips: r.fips,
      county_name: r.county_name,
      state_code: r.state_code,
      state_name: r.state_name,
      total_beneficiaries: Number(r.total_beneficiaries),
      plan_count: Number(r.plan_count),
      rate_benchmark: r.rate_year
        ? {
            year: Number(r.rate_year),
            cms_county_code: r.cms_county_code,
            rate_5_star: Number(r.rate_5_star),
            rate_3_5_star: Number(r.rate_3_5_star),
            rate_0_star: Number(r.rate_0_star),
            esrd_rate: Number(r.esrd_rate),
          }
        : null,
      d_snp_plans: Number(r.d_snp_plans ?? 0),
      fide_plans: Number(r.fide_plans ?? 0),
      hide_plans: Number(r.hide_plans ?? 0),
      coordinated_plans: Number(r.coordinated_plans ?? 0),
      hhi: Number(r.hhi),
      top1_plan_name: r.top1_plan_name,
      top1_sponsor_name: r.top1_sponsor_name,
      top1_plan_type: r.top1_plan_type,
      top1_share_pct: top1Share,
      top2_plan_name: r.top2_plan_name ?? null,
      top2_sponsor_name: r.top2_sponsor_name ?? null,
      top2_share_pct: r.top2_share_pct != null ? Number(r.top2_share_pct) : null,
      top2_combined_pct: top2Combined,
      is_monopoly: top1Share > 80,
      is_duopoly: top1Share <= 80 && top2Combined > 70,
      year: Number(r.year),
    };
  });

  res.json(GetCountyConcentrationResponse.parse(rows));
});

export default router;
