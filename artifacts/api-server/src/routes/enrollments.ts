import { Router, type IRouter } from "express";
import { db, enrollmentsTable } from "@workspace/db";
import {
  GetPlanEnrollmentsParams,
  GetPlanEnrollmentsQueryParams,
  GetPlanEnrollmentsResponse,
  ListEnrollmentsQueryParams,
  ListEnrollmentsResponse,
  CreateEnrollmentBody,
  CreateEnrollmentResponse,
} from "@workspace/api-zod";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/plans/:id/enrollments", async (req, res): Promise<void> => {
  const params = GetPlanEnrollmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetPlanEnrollmentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { id } = params.data;
  const { year } = query.data ?? {};

  // check plan exists
  const planCheck = await db.execute(sql`SELECT id FROM plans WHERE id = ${id}`);
  if (planCheck.rows.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const result = await db.execute(sql`
    SELECT
      e.id,
      e.plan_id,
      p.plan_name,
      p.contract_id,
      p.plan_type,
      p.sponsor_name,
      e.county_fips,
      c.county_name,
      c.state_code,
      e.beneficiary_count,
      CASE WHEN pcc.id IS NOT NULL THEN pcc.monthly_premium::float ELSE p.monthly_premium::float END AS monthly_premium,
      CASE WHEN pcc.id IS NOT NULL THEN pcc.moop::float ELSE p.moop::float END AS moop,
      CASE WHEN pcc.id IS NOT NULL THEN pcc.source ELSE p.cost_source END AS cost_source,
      e.year
    FROM enrollments e
    JOIN plans p ON p.id = e.plan_id
    JOIN counties c ON c.fips = e.county_fips
    LEFT JOIN plan_county_costs pcc
      ON pcc.plan_id = e.plan_id
      AND pcc.county_fips = e.county_fips
      AND pcc.year = e.year
    WHERE e.plan_id = ${id}
    ${year ? sql`AND e.year = ${year}` : sql``}
    ORDER BY e.beneficiary_count DESC
  `);

  const enrollments = (result.rows as any[]).map(mapEnrollment);
  res.json(GetPlanEnrollmentsResponse.parse(enrollments));
});

router.get("/enrollments", async (req, res): Promise<void> => {
  const query = ListEnrollmentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const {
    state_code,
    county_fips,
    plan_type,
    year,
    min_beneficiaries,
    limit = 100,
    offset = 0,
  } = query.data ?? {};

  const conditions: string[] = [];

  if (state_code) {
    conditions.push(`c.state_code = ${sqlLiteral(state_code)}`);
  }
  if (county_fips) {
    conditions.push(`e.county_fips = ${sqlLiteral(county_fips)}`);
  }
  if (plan_type) {
    conditions.push(`p.plan_type = ${sqlLiteral(plan_type)}`);
  }
  if (year) {
    conditions.push(`e.year = ${sqlLiteral(year)}`);
  }
  if (min_beneficiaries) {
    conditions.push(`e.beneficiary_count >= ${sqlLiteral(min_beneficiaries)}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute(sql.raw(
    `SELECT
      e.id,
      e.plan_id,
      p.plan_name,
      p.contract_id,
      p.plan_type,
      p.sponsor_name,
      e.county_fips,
      c.county_name,
      c.state_code,
      e.beneficiary_count,
      CASE WHEN pcc.id IS NOT NULL THEN pcc.monthly_premium::float ELSE p.monthly_premium::float END AS monthly_premium,
      CASE WHEN pcc.id IS NOT NULL THEN pcc.moop::float ELSE p.moop::float END AS moop,
      CASE WHEN pcc.id IS NOT NULL THEN pcc.source ELSE p.cost_source END AS cost_source,
      e.year
    FROM enrollments e
    JOIN plans p ON p.id = e.plan_id
    JOIN counties c ON c.fips = e.county_fips
    LEFT JOIN plan_county_costs pcc
      ON pcc.plan_id = e.plan_id
      AND pcc.county_fips = e.county_fips
      AND pcc.year = e.year
    ${whereClause}
    ORDER BY e.beneficiary_count DESC
     LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
  ));

  const enrollments = (result.rows as any[]).map(mapEnrollment);
  res.json(ListEnrollmentsResponse.parse(enrollments));
});

router.post("/enrollments", async (req, res): Promise<void> => {
  const body = CreateEnrollmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [enrollment] = await db
    .insert(enrollmentsTable)
    .values({
      plan_id: body.data.plan_id,
      county_fips: body.data.county_fips,
      beneficiary_count: body.data.beneficiary_count,
      year: body.data.year,
    })
    .returning();

  const result = await db.execute(sql`
    SELECT
      e.id, e.plan_id, p.plan_name, p.contract_id, p.plan_type, p.sponsor_name,
      e.county_fips, c.county_name, c.state_code, e.beneficiary_count, e.year
    FROM enrollments e
    JOIN plans p ON p.id = e.plan_id
    JOIN counties c ON c.fips = e.county_fips
    WHERE e.id = ${enrollment.id}
  `);

  res.status(201).json(CreateEnrollmentResponse.parse(mapEnrollment(result.rows[0] as any)));
});

function mapEnrollment(r: any) {
  return {
    id: Number(r.id),
    plan_id: Number(r.plan_id),
    plan_name: r.plan_name,
    contract_id: r.contract_id,
    plan_type: r.plan_type,
    sponsor_name: r.sponsor_name,
    county_fips: r.county_fips,
    county_name: r.county_name,
    state_code: r.state_code,
    beneficiary_count: Number(r.beneficiary_count),
    monthly_premium: r.monthly_premium != null ? Number(r.monthly_premium) : null,
    moop: r.moop != null ? Number(r.moop) : null,
    cost_source: r.cost_source ?? null,
    year: Number(r.year),
  };
}

function sqlLiteral(value: string | number): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

export default router;
