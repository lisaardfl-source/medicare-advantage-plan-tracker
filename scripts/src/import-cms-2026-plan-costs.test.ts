import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanSummaries,
  getCountyReplacementPlanIds,
  type CmsCost,
  type PlanRecord,
} from "./import-cms-2026-plan-costs";

const plan: PlanRecord = {
  id: 1,
  contractId: "H1234",
  planId: "001",
};

function cost(
  segmentId: number,
  monthlyPremium: number | null,
  moop: number | null,
): CmsCost {
  return {
    contractId: plan.contractId,
    planId: plan.planId,
    segmentId,
    version: 1,
    monthlyPremium,
    moop,
    moopType: moop == null ? null : "1",
  };
}

test("mixed published and unpublished segments preserve the explicit null", () => {
  const result = buildPlanSummaries(
    [plan],
    new Map([
      ["segment-1", cost(1, 25, 4_000)],
      ["segment-2", cost(2, null, null)],
    ]),
  );

  assert.equal(result.matchedPlans, 1);
  assert.equal(result.variedPlans, 1);
  assert.equal(result.updates.length, 1);
  assert.deepEqual(result.updates[0], {
    id: 1,
    monthlyPremium: null,
    monthlyPremiumMin: "25",
    monthlyPremiumMax: "25",
    premiumVaries: true,
    premiumHasUnpublished: true,
    moop: null,
    moopMin: "4000",
    moopMax: "4000",
    moopType: "1",
    moopVaries: true,
    moopHasUnpublished: true,
    varies: true,
    source: "CMS PBP Benefits 2026",
    sourceUrl: "https://www.cms.gov/files/zip/pbp-benefits-2026.zip",
    importedAt: result.updates[0]?.importedAt,
  });
});

test("unmatched plans are excluded from replacement updates", () => {
  const unmatched: PlanRecord = {
    id: 2,
    contractId: "H9999",
    planId: "999",
  };
  const result = buildPlanSummaries(
    [plan, unmatched],
    new Map([["segment-0", cost(0, 0, 6_750)]]),
  );

  assert.equal(result.matchedPlans, 1);
  assert.deepEqual(
    result.updates.map((update) => update.id),
    [plan.id],
  );
  assert.deepEqual(getCountyReplacementPlanIds(result.updates), [plan.id]);
  assert.equal(
    getCountyReplacementPlanIds(result.updates).includes(unmatched.id),
    false,
  );
});

test("uniform zero premiums remain published zero values", () => {
  const result = buildPlanSummaries(
    [plan],
    new Map([
      ["segment-1", cost(1, 0, 3_000)],
      ["segment-2", cost(2, 0, 3_000)],
    ]),
  );
  const update = result.updates[0];

  assert.equal(update?.monthlyPremium, "0");
  assert.equal(update?.premiumHasUnpublished, false);
  assert.equal(update?.moop, "3000");
  assert.equal(update?.varies, false);
});