import { Router, type IRouter } from "express";
import { db, plansTable, enrollmentsTable } from "@workspace/db";
import { ListStatesResponse } from "@workspace/api-zod";
import { sql, eq, count, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/states", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      state_code: plansTable.plan_type,
    })
    .from(plansTable);

  // Use raw SQL for the grouped aggregation
  const result = await db.execute(sql`
    SELECT
      c.state_code,
      c.state_name,
      COUNT(DISTINCT p.id) AS plan_count,
      COALESCE(SUM(e.beneficiary_count), 0) AS total_beneficiaries
    FROM counties c
    JOIN enrollments e ON e.county_fips = c.fips
    JOIN plans p ON p.id = e.plan_id
    GROUP BY c.state_code, c.state_name
    ORDER BY c.state_name ASC
  `);

  const states = (result.rows as any[]).map((r) => ({
    state_code: r.state_code,
    state_name: r.state_name,
    plan_count: Number(r.plan_count),
    total_beneficiaries: Number(r.total_beneficiaries),
  }));

  res.json(ListStatesResponse.parse(states));
});

export default router;
