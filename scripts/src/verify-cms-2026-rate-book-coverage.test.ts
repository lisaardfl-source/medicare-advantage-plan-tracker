import assert from "node:assert/strict";
import test from "node:test";
import { CONFIRMED_NO_2026_RATE } from "./import-cms-2026-rate-book";
import {
  assertCms2026CountyRateCoverage,
  EXPECTED_2026_RATE_BENCHMARK_COUNT,
  EXPECTED_2026_TRACKED_COUNTY_COUNT,
} from "./verify-cms-2026-rate-book-coverage";

function expectedCoverage(): { countyFips: string[]; rateFips: string[] } {
  const documentedGapFips = Object.keys(CONFIRMED_NO_2026_RATE).filter(
    (fips) => fips !== "78030",
  );
  const benchmarkFips = Array.from(
    { length: EXPECTED_2026_RATE_BENCHMARK_COUNT },
    (_, index) => `BENCHMARK-${String(index).padStart(4, "0")}`,
  );
  const countyFips = [...documentedGapFips, ...benchmarkFips];

  assert.equal(countyFips.length, EXPECTED_2026_TRACKED_COUNTY_COUNT);
  return { countyFips, rateFips: benchmarkFips };
}

test("accepts exactly the 14 reviewed database benchmark gaps", () => {
  const summary = assertCms2026CountyRateCoverage(expectedCoverage());

  assert.equal(summary.countyCount, EXPECTED_2026_TRACKED_COUNTY_COUNT);
  assert.equal(summary.benchmarkCount, EXPECTED_2026_RATE_BENCHMARK_COUNT);
  assert.equal(summary.documentedGapFips.length, 14);
  assert.ok(!summary.documentedGapFips.includes("78030"));
});

test("fails when a tracked county loses an undocumented benchmark", () => {
  const coverage = expectedCoverage();
  coverage.rateFips.pop();

  assert.throws(
    () => assertCms2026CountyRateCoverage(coverage),
    /Unexpectedly missing benchmark FIPS: BENCHMARK-3221/,
  );
});

test("fails when a documented gap unexpectedly gains a benchmark", () => {
  const coverage = expectedCoverage();
  coverage.rateFips.push("51515");

  assert.throws(
    () => assertCms2026CountyRateCoverage(coverage),
    /Documented gap FIPS that now have a benchmark: 51515/,
  );
});