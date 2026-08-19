import assert from "node:assert/strict";
import test from "node:test";
import {
  LOOK_ALIKE_THRESHOLD_PCT,
  meetsLookAlikeRule,
  normalizeDualEligiblePct,
  readRows,
} from "./import-cms-2026-look-alikes";

test("the current CMS threshold includes exactly 70 percent", () => {
  assert.equal(LOOK_ALIKE_THRESHOLD_PCT, 70);
  assert.equal(
    meetsLookAlikeRule({
      dualEligiblePct: 70,
      totalEnrollment: 201,
      cmsDetermination: null,
      activeLessThanOneYear: false,
    }),
    true,
  );
  assert.equal(
    meetsLookAlikeRule({
      dualEligiblePct: 69.99,
      totalEnrollment: 1_000,
      cmsDetermination: null,
      activeLessThanOneYear: null,
    }),
    false,
  );
});

test("the CMS small new-plan exception is not flagged", () => {
  assert.equal(
    meetsLookAlikeRule({
      dualEligiblePct: 95,
      totalEnrollment: 200,
      cmsDetermination: false,
      activeLessThanOneYear: true,
    }),
    false,
  );
});

test("new plans require CMS's final determination", () => {
  assert.throws(
    () =>
      meetsLookAlikeRule({
        dualEligiblePct: 95,
        totalEnrollment: null,
        cmsDetermination: null,
        activeLessThanOneYear: true,
      }),
    /new plan requires CMS's final look-alike determination/,
  );
});

test("January enrollment alone cannot invoke the small new-plan exception", () => {
  assert.throws(
    () =>
      meetsLookAlikeRule({
        dualEligiblePct: 80,
        totalEnrollment: 200,
        cmsDetermination: null,
        activeLessThanOneYear: true,
      }),
    /January enrollment cannot resolve the small-plan exception/,
  );
});

test("percentage-only rows require a CMS determination at the threshold", () => {
  assert.throws(
    () =>
      readRows(
        [
          "Contract Number,Plan ID,Dual Eligible Percentage",
          "H1234,001,70",
        ].join("\n"),
      ),
    /requires a CMS determination or plan-age indicator/,
  );
});

test("suppressed dual enrollment remains unknown rather than zero", () => {
  const [row] = readRows(
    [
      "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment,New Plan Indicator",
      "H1234,001,*,500",
    ].join("\n"),
  );
  assert.equal(row?.planId, "1");
  assert.equal(row?.dualEligibleEnrollment, null);
  assert.equal(row?.dualEligiblePct, null);
  assert.equal(row?.status, "suppressed");
  assert.equal(row?.meetsLookAlikeRule, false);
});

test("blank and N/A values are unknown, not reported as CMS-suppressed", () => {
  for (const value of ["", "N/A"]) {
    const [row] = readRows(
      [
        "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment",
        `H1234,001,${value},500`,
      ].join("\n"),
    );
    assert.equal(row?.status, "unknown");
    assert.equal(row?.meetsLookAlikeRule, false);
  }
});

test("a CMS indicator cannot classify a row with suppressed dual data", () => {
  const [row] = readRows(
    [
      "Contract Number,Plan ID,Dual Eligible Percentage,Look Alike Indicator",
      "H1234,001,*,Yes",
    ].join("\n"),
  );
  assert.equal(row?.status, "suppressed");
  assert.equal(row?.meetsLookAlikeRule, false);
});

test("dual share is calculated from CMS counts and padded plan IDs normalize", () => {
  const [row] = readRows(
    [
      "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment,New Plan Indicator",
      "H1234,001,350,500,No",
    ].join("\n"),
  );
  assert.equal(row?.planId, "1");
  assert.equal(row?.dualEligiblePct, 70);
  assert.equal(row?.meetsLookAlikeRule, true);
});

test("a reported percentage cannot use a zero enrollment denominator", () => {
  assert.throws(
    () =>
      readRows(
        [
          "Contract Number,Plan ID,Dual Eligible Percentage,Total Enrollment,New Plan Indicator",
          "H1234,001,70,0,No",
        ].join("\n"),
      ),
    /reports a percentage with zero total enrollment/,
  );
});

test("dual enrollment cannot exceed total enrollment", () => {
  assert.throws(
    () =>
      readRows(
        [
          "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment",
          "H1234,001,501,500",
        ].join("\n"),
      ),
    /dual-eligible enrollment above total enrollment/,
  );
});

test("a sub-threshold share cannot round up to the displayed threshold", () => {
  const [row] = readRows(
    [
      "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment",
      "H1234,001,13999,20000",
    ].join("\n"),
  );
  assert.equal(normalizeDualEligiblePct(69.995), 69.995);
  assert.equal(row?.dualEligiblePct, 69.995);
  assert.equal(row?.meetsLookAlikeRule, false);
});

test("reported percentage must agree with supplied enrollment counts", () => {
  assert.throws(
    () =>
      readRows(
        [
          "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment,Dual Eligible Percentage,New Plan Indicator",
          "H1234,001,10,100,75,No",
        ].join("\n"),
      ),
    /reported percentage inconsistent with dual and total enrollment/,
  );
});

test("reported and calculated percentages cannot disagree across the threshold", () => {
  assert.throws(
    () =>
      readRows(
        [
          "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment,Dual Eligible Percentage,New Plan Indicator",
          "H1234,001,6999,10000,70.0,No",
        ].join("\n"),
      ),
    /reported percentage inconsistent with dual and total enrollment/,
  );
});

test("counts determine the persisted percentage within reported precision", () => {
  const [row] = readRows(
    [
      "Contract Number,Plan ID,Dual Eligible Enrollment,Total Enrollment,Dual Eligible Percentage,New Plan Indicator",
      "H1234,001,746,1000,75,No",
    ].join("\n"),
  );
  assert.equal(row?.dualEligiblePct, 74.6);
  assert.equal(row?.meetsLookAlikeRule, true);
});