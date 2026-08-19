import { pathToFileURL } from "node:url";
import { db, countiesTable, countyRatesTable, pool } from "@workspace/db";
import { CONFIRMED_NO_2026_RATE } from "@workspace/cms-rate-reference";
import { eq } from "drizzle-orm";

const RATE_YEAR = 2026;

export const EXPECTED_2026_TRACKED_COUNTY_COUNT = 3_236;
export const EXPECTED_2026_RATE_BENCHMARK_COUNT = 3_222;
export const EXPECTED_2026_RATE_BENCHMARK_GAP_COUNT = 14;

export type CountyRateCoverage = {
  countyFips: readonly string[];
  rateFips: readonly string[];
};

export type CountyRateCoverageSummary = {
  countyCount: number;
  benchmarkCount: number;
  documentedGapFips: string[];
};

function sortedDifference(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  return [...duplicates].sort();
}

/**
 * Ensures the stored CY2026 benchmarks cover every tracked CPSC
 * county-equivalent except the reviewed, source-documented CMS gaps.
 *
 * The CMS non-coverage map includes St. Thomas for rate-book reconciliation,
 * but it is not a county in the current CPSC import. Intersecting the map with
 * the tracked county table yields the 14 intentional database gaps.
 */
export function assertCms2026CountyRateCoverage(
  coverage: CountyRateCoverage,
): CountyRateCoverageSummary {
  const countyFips = new Set(coverage.countyFips);
  const rateFips = new Set(coverage.rateFips);
  const documentedGapFips = Object.keys(CONFIRMED_NO_2026_RATE)
    .filter((fips) => countyFips.has(fips))
    .sort();
  const actualGapFips = sortedDifference(countyFips, rateFips);
  const unexpectedMissingFips = sortedDifference(
    new Set(actualGapFips),
    new Set(documentedGapFips),
  );
  const documentedGapsWithRates = sortedDifference(
    new Set(documentedGapFips),
    new Set(actualGapFips),
  );
  const orphanRateFips = sortedDifference(rateFips, countyFips);
  const duplicateCountyFips = duplicateValues(coverage.countyFips);
  const duplicateRateFips = duplicateValues(coverage.rateFips);

  const failures = [
    coverage.countyFips.length !== EXPECTED_2026_TRACKED_COUNTY_COUNT
      ? `Expected ${EXPECTED_2026_TRACKED_COUNTY_COUNT.toLocaleString()} tracked county-equivalents but found ${coverage.countyFips.length.toLocaleString()}.`
      : null,
    coverage.rateFips.length !== EXPECTED_2026_RATE_BENCHMARK_COUNT
      ? `Expected ${EXPECTED_2026_RATE_BENCHMARK_COUNT.toLocaleString()} CY${RATE_YEAR} county benchmarks but found ${coverage.rateFips.length.toLocaleString()}.`
      : null,
    documentedGapFips.length !== EXPECTED_2026_RATE_BENCHMARK_GAP_COUNT
      ? `Expected ${EXPECTED_2026_RATE_BENCHMARK_GAP_COUNT} documented CY${RATE_YEAR} database gaps but found ${documentedGapFips.length}: ${documentedGapFips.join(", ") || "(none)"}.`
      : null,
    duplicateCountyFips.length > 0
      ? `Duplicate tracked county FIPS: ${duplicateCountyFips.join(", ")}.`
      : null,
    duplicateRateFips.length > 0
      ? `Duplicate CY${RATE_YEAR} benchmark FIPS: ${duplicateRateFips.join(", ")}.`
      : null,
    unexpectedMissingFips.length > 0
      ? `Unexpectedly missing benchmark FIPS: ${unexpectedMissingFips.join(", ")}.`
      : null,
    documentedGapsWithRates.length > 0
      ? `Documented gap FIPS that now have a benchmark: ${documentedGapsWithRates.join(", ")}.`
      : null,
    orphanRateFips.length > 0
      ? `Benchmark FIPS absent from tracked counties: ${orphanRateFips.join(", ")}.`
      : null,
  ].filter((failure): failure is string => failure !== null);

  if (failures.length > 0) {
    throw new Error(
      `CMS ${RATE_YEAR} county benchmark coverage drift detected:\n- ${failures.join("\n- ")}`,
    );
  }

  return {
    countyCount: coverage.countyFips.length,
    benchmarkCount: coverage.rateFips.length,
    documentedGapFips,
  };
}

export async function verifyCms2026CountyRateCoverage(): Promise<CountyRateCoverageSummary> {
  const [counties, rates] = await Promise.all([
    db.select({ fips: countiesTable.fips }).from(countiesTable),
    db
      .select({ fips: countyRatesTable.county_fips })
      .from(countyRatesTable)
      .where(eq(countyRatesTable.year, RATE_YEAR)),
  ]);

  return assertCms2026CountyRateCoverage({
    countyFips: counties.map((county) => county.fips),
    rateFips: rates.map((rate) => rate.fips),
  });
}

async function main(): Promise<void> {
  const summary = await verifyCms2026CountyRateCoverage();
  console.log(
    `Verified ${summary.benchmarkCount.toLocaleString()} CY${RATE_YEAR} county benchmarks for ` +
      `${summary.countyCount.toLocaleString()} tracked county-equivalents; ` +
      `${summary.documentedGapFips.length} reviewed gaps: ${summary.documentedGapFips.join(", ")}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
