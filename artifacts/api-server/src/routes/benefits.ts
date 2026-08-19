import { Router, type IRouter } from "express";
import { db, benefitsTable, plansTable } from "@workspace/db";
import {
  GetPlanBenefitsParams,
  GetPlanBenefitsResponse,
  AddPlanBenefitParams,
  AddPlanBenefitBody,
  AddPlanBenefitResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/plans/:id/benefits", async (req, res): Promise<void> => {
  const params = GetPlanBenefitsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const planCheck = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.id, params.data.id));

  if (planCheck.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const benefits = await db
    .select()
    .from(benefitsTable)
    .where(eq(benefitsTable.plan_id, params.data.id))
    .orderBy(benefitsTable.benefit_category, benefitsTable.benefit_name);

  const mapped = benefits.map((b) => ({
    id: b.id,
    plan_id: b.plan_id,
    benefit_name: b.benefit_name,
    benefit_category: b.benefit_category,
    benefit_value: b.benefit_value ?? null,
    is_attributed: b.is_attributed,
  }));

  res.json(GetPlanBenefitsResponse.parse(mapped));
});

router.post("/plans/:id/benefits", async (req, res): Promise<void> => {
  const params = AddPlanBenefitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = AddPlanBenefitBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const planCheck = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(eq(plansTable.id, params.data.id));

  if (planCheck.length === 0) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const [benefit] = await db
    .insert(benefitsTable)
    .values({
      plan_id: params.data.id,
      benefit_name: body.data.benefit_name,
      benefit_category: body.data.benefit_category,
      benefit_value: body.data.benefit_value ?? null,
      is_attributed: body.data.is_attributed,
    })
    .returning();

  res.status(201).json(
    AddPlanBenefitResponse.parse({
      id: benefit.id,
      plan_id: benefit.plan_id,
      benefit_name: benefit.benefit_name,
      benefit_category: benefit.benefit_category,
      benefit_value: benefit.benefit_value ?? null,
      is_attributed: benefit.is_attributed,
    })
  );
});

export default router;
