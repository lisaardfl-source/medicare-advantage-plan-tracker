import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ListCountiesResponse,
  GetCountyPlansResponse,
  ListCountiesQueryParams,
  GetCountyPlansParams,
  GetCountyPlansQueryParams,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/counties", async (req, res): Promise<void> => {
  const query = ListCountiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { state_code } = query.data;

  const whereClause = state_code
    ? sql`WHERE state_code = ${state_code}`
    : sql``;

  const result = await db.execute(sql`
    SELECT fips, county_name, state_code, state_name
    FROM counties
    ${whereClause}
    ORDER BY state_name ASC, county_name ASC
  `);

  const counties = result.rows as any[];
  res.json(ListCountiesResponse.parse(counties));
});

router.get("/counties/:fips/plans", async (req, res): Promise<void> => {
  const params = GetCountyPlansParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetCountyPlansQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { fips } = params.data;
  const { plan_type, year } = query.data ?? {};

  const result = await db.execute(sql`
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
      p.drug_premium::float,
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
    FROM plans p
    JOIN enrollments e ON e.plan_id = p.id
    LEFT JOIN plan_county_costs pcc
      ON pcc.plan_id = p.id
      AND pcc.county_fips = e.county_fips
      AND pcc.year = e.year
    WHERE e.county_fips = ${fips}
    ${plan_type ? sql`AND p.plan_type = ${plan_type}` : sql``}
    ${year ? sql`AND e.year = ${year}` : sql``}
    ORDER BY e.beneficiary_count DESC
  `);

  if (result.rows.length === 0) {
    // check if county exists
    const countyCheck = await db.execute(
      sql`SELECT fips FROM counties WHERE fips = ${fips}`
    );
    if (countyCheck.rows.length === 0) {
      res.status(404).json({ error: "County not found" });
      return;
    }
  }

  const plans = (result.rows as any[]).map((r) => ({
    plan_id: Number(r.plan_id),
    contract_id: r.contract_id,
    plan_name: r.plan_name,
    sponsor_name: r.sponsor_name,
    plan_type: r.plan_type,
    monthly_premium: r.monthly_premium != null ? Number(r.monthly_premium) : null,
    drug_premium: r.drug_premium != null ? Number(r.drug_premium) : null,
    moop: r.moop != null ? Number(r.moop) : null,
    cost_source: r.cost_source ?? null,
    star_rating: r.star_rating != null ? Number(r.star_rating) : null,
    star_rating_part_c: r.star_rating_part_c != null ? Number(r.star_rating_part_c) : null,
    star_rating_part_d: r.star_rating_part_d != null ? Number(r.star_rating_part_d) : null,
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
    contract_effective_year:
      r.contract_effective_year != null ? Number(r.contract_effective_year) : null,
    beneficiary_count: Number(r.beneficiary_count),
    year: Number(r.year),
  }));

  res.json(GetCountyPlansResponse.parse(plans));
});

export default router;
