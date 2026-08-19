import { Router, type IRouter } from "express";
import { db, plansTable } from "@workspace/db";
import {
  ListPlansQueryParams,
  ListPlansResponse,
  CreatePlanBody,
  CreatePlanResponse,
  GetPlanParams,
  GetPlanResponse,
  UpdatePlanParams,
  UpdatePlanBody,
  UpdatePlanResponse,
  DeletePlanParams,
} from "@workspace/api-zod";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/plans", async (req, res): Promise<void> => {
  const query = ListPlansQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const {
    state_code,
    county_fips,
    plan_type,
    sponsor,
    year,
    limit = 50,
    offset = 0,
  } = query.data ?? {};

  const conditions: string[] = [];

  if (state_code) {
    conditions.push(`EXISTS (
      SELECT 1 FROM enrollments e
      JOIN counties c ON c.fips = e.county_fips
       WHERE e.plan_id = p.id AND c.state_code = ${sqlLiteral(state_code)}
    )`);
  }

  if (county_fips) {
    conditions.push(`EXISTS (
       SELECT 1 FROM enrollments e WHERE e.plan_id = p.id AND e.county_fips = ${sqlLiteral(county_fips)}
    )`);
  }

  if (plan_type) {
    conditions.push(`p.plan_type = ${sqlLiteral(plan_type)}`);
  }

  if (sponsor) {
    conditions.push(`p.sponsor_name ILIKE ${sqlLiteral(`%${sponsor}%`)}`);
  }

  if (year) {
    conditions.push(`p.year = ${sqlLiteral(year)}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const plansResult = await db.execute(sql.raw(
    `SELECT
      p.id, p.contract_id, p.plan_id, p.plan_name, p.sponsor_name, p.plan_type,
      p.monthly_premium::float, p.monthly_premium_min::float, p.monthly_premium_max::float,
      p.drug_premium::float, p.moop::float, p.moop_min::float, p.moop_max::float,
      p.moop_type, p.costs_vary_by_county,
      p.premium_varies_by_county, p.premium_has_unpublished_counties,
      p.moop_varies_by_county, p.moop_has_unpublished_counties,
      p.cost_source, p.cost_source_url, p.cost_imported_at,
      p.star_rating::float, p.star_rating_part_c::float, p.star_rating_part_d::float,
      p.d_snp_integration, p.frailty_eligible, p.is_look_alike,
      p.dual_eligible_enrollment, p.look_alike_total_enrollment,
      p.dual_eligible_pct::float,
      p.dual_eligible_data_status, p.dual_eligible_source_url,
      p.parent_organization, p.contract_effective_year, p.offers_part_d,
      p.year, p.created_at
     FROM plans p
     ${whereClause}
     ORDER BY p.year DESC, p.plan_name ASC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
  ));

  const countResult = await db.execute(sql.raw(
    `SELECT COUNT(*) AS total FROM plans p ${whereClause}`
  ));

  const plans = (plansResult.rows as any[]).map(mapPlan);
  const total = Number((countResult.rows[0] as any)?.total ?? 0);

  res.json(
    ListPlansResponse.parse({
      plans,
      total,
      limit: Number(limit),
      offset: Number(offset),
    })
  );
});

router.post("/plans", async (req, res): Promise<void> => {
  const body = CreatePlanBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [plan] = await db
    .insert(plansTable)
    .values({
      contract_id: body.data.contract_id,
      plan_id: body.data.plan_id,
      plan_name: body.data.plan_name,
      sponsor_name: body.data.sponsor_name,
      plan_type: body.data.plan_type as any,
      monthly_premium: body.data.monthly_premium?.toString() ?? null,
      monthly_premium_min: body.data.monthly_premium?.toString() ?? null,
      monthly_premium_max: body.data.monthly_premium?.toString() ?? null,
      drug_premium: body.data.drug_premium?.toString() ?? null,
      moop: body.data.moop?.toString() ?? null,
      moop_min: body.data.moop?.toString() ?? null,
      moop_max: body.data.moop?.toString() ?? null,
      star_rating: body.data.star_rating?.toString() ?? null,
      year: body.data.year,
    })
    .returning();

  res.status(201).json(CreatePlanResponse.parse(mapPlan(plan)));
});

router.get("/plans/:id", async (req, res): Promise<void> => {
  const params = GetPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { id } = params.data;

  const result = await db.execute(sql`
    SELECT
      p.id, p.contract_id, p.plan_id, p.plan_name, p.sponsor_name, p.plan_type,
      p.monthly_premium::float, p.monthly_premium_min::float, p.monthly_premium_max::float,
      p.drug_premium::float, p.moop::float, p.moop_min::float, p.moop_max::float,
      p.moop_type, p.costs_vary_by_county,
      p.premium_varies_by_county, p.premium_has_unpublished_counties,
      p.moop_varies_by_county, p.moop_has_unpublished_counties,
      p.cost_source, p.cost_source_url, p.cost_imported_at,
      p.star_rating::float, p.star_rating_part_c::float, p.star_rating_part_d::float,
      p.d_snp_integration, p.frailty_eligible, p.is_look_alike,
      p.dual_eligible_enrollment, p.look_alike_total_enrollment,
      p.dual_eligible_pct::float,
      p.dual_eligible_data_status, p.dual_eligible_source_url,
      p.parent_organization, p.contract_effective_year, p.offers_part_d,
      p.year, p.created_at,
      COALESCE(SUM(e.beneficiary_count), 0) AS total_beneficiaries,
      COUNT(DISTINCT e.county_fips) AS county_count
    FROM plans p
    LEFT JOIN enrollments e ON e.plan_id = p.id
    WHERE p.id = ${id}
    GROUP BY p.id
  `);

  if (result.rows.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const planRow = result.rows[0] as any;

  const benefitsResult = await db.execute(sql`
    SELECT id, plan_id, benefit_name, benefit_category, benefit_value, is_attributed
    FROM benefits WHERE plan_id = ${id}
    ORDER BY benefit_category ASC, benefit_name ASC
  `);

  const detail = {
    ...mapPlan(planRow),
    total_beneficiaries: Number(planRow.total_beneficiaries),
    county_count: Number(planRow.county_count),
    benefits: (benefitsResult.rows as any[]).map(mapBenefit),
  };

  res.json(GetPlanResponse.parse(detail));
});

router.patch("/plans/:id", async (req, res): Promise<void> => {
  const params = UpdatePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdatePlanBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const isCmsCostUpdate =
    body.data.monthly_premium !== undefined || body.data.moop !== undefined;
  if (isCmsCostUpdate) {
    const [currentPlan] = await db
      .select({
        id: plansTable.id,
        cost_source: plansTable.cost_source,
      })
      .from(plansTable)
      .where(eq(plansTable.id, params.data.id));
    if (!currentPlan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }
    if (currentPlan.cost_source) {
      res.status(409).json({
        error:
          "CMS-imported premium and MOOP values are read-only. Re-run the CMS import to update them.",
      });
      return;
    }
  }

  const updates: Record<string, any> = {};
  if (body.data.plan_name !== undefined) updates.plan_name = body.data.plan_name;
  if (body.data.sponsor_name !== undefined) updates.sponsor_name = body.data.sponsor_name;
  if (body.data.plan_type !== undefined) updates.plan_type = body.data.plan_type;
  if (body.data.monthly_premium !== undefined) {
    updates.monthly_premium = body.data.monthly_premium?.toString() ?? null;
    updates.monthly_premium_min = body.data.monthly_premium?.toString() ?? null;
    updates.monthly_premium_max = body.data.monthly_premium?.toString() ?? null;
    updates.premium_varies_by_county = false;
    updates.premium_has_unpublished_counties = false;
    updates.costs_vary_by_county = false;
    updates.cost_source = null;
    updates.cost_source_url = null;
    updates.cost_imported_at = null;
  }
  if (body.data.drug_premium !== undefined)
    updates.drug_premium = body.data.drug_premium?.toString() ?? null;
  if (body.data.moop !== undefined) {
    updates.moop = body.data.moop?.toString() ?? null;
    updates.moop_min = body.data.moop?.toString() ?? null;
    updates.moop_max = body.data.moop?.toString() ?? null;
    updates.moop_type = null;
    updates.moop_varies_by_county = false;
    updates.moop_has_unpublished_counties = false;
    updates.costs_vary_by_county = false;
    updates.cost_source = null;
    updates.cost_source_url = null;
    updates.cost_imported_at = null;
  }
  if (body.data.star_rating !== undefined)
    updates.star_rating = body.data.star_rating?.toString() ?? null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [plan] = await db
    .update(plansTable)
    .set(updates)
    .where(eq(plansTable.id, params.data.id))
    .returning();

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.json(UpdatePlanResponse.parse(mapPlan(plan)));
});

router.delete("/plans/:id", async (req, res): Promise<void> => {
  const params = DeletePlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [plan] = await db
    .delete(plansTable)
    .where(eq(plansTable.id, params.data.id))
    .returning();

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.sendStatus(204);
});

function mapPlan(r: any) {
  return {
    id: Number(r.id),
    contract_id: r.contract_id,
    plan_id: r.plan_id,
    plan_name: r.plan_name,
    sponsor_name: r.sponsor_name,
    plan_type: r.plan_type,
    monthly_premium: r.monthly_premium != null ? Number(r.monthly_premium) : null,
    monthly_premium_min: r.monthly_premium_min != null ? Number(r.monthly_premium_min) : null,
    monthly_premium_max: r.monthly_premium_max != null ? Number(r.monthly_premium_max) : null,
    drug_premium: r.drug_premium != null ? Number(r.drug_premium) : null,
    moop: r.moop != null ? Number(r.moop) : null,
    moop_min: r.moop_min != null ? Number(r.moop_min) : null,
    moop_max: r.moop_max != null ? Number(r.moop_max) : null,
    moop_type: r.moop_type ?? null,
    costs_vary_by_county: Boolean(r.costs_vary_by_county),
    premium_varies_by_county: Boolean(r.premium_varies_by_county),
    premium_has_unpublished_counties: Boolean(r.premium_has_unpublished_counties),
    moop_varies_by_county: Boolean(r.moop_varies_by_county),
    moop_has_unpublished_counties: Boolean(r.moop_has_unpublished_counties),
    cost_source: r.cost_source ?? null,
    cost_source_url: r.cost_source_url ?? null,
    cost_imported_at:
      r.cost_imported_at instanceof Date
        ? r.cost_imported_at.toISOString()
        : r.cost_imported_at ?? null,
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
    contract_effective_year: r.contract_effective_year != null ? Number(r.contract_effective_year) : null,
    offers_part_d: r.offers_part_d != null ? Boolean(r.offers_part_d) : null,
    year: Number(r.year),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

function mapBenefit(r: any) {
  return {
    id: Number(r.id),
    plan_id: Number(r.plan_id),
    benefit_name: r.benefit_name,
    benefit_category: r.benefit_category,
    benefit_value: r.benefit_value ?? null,
    is_attributed: Boolean(r.is_attributed),
  };
}

function sqlLiteral(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

export default router;
