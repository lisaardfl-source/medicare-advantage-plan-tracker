import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { db, countiesTable, countyRatesTable, pool } from "@workspace/db";
export { CONFIRMED_NO_2026_RATE } from "@workspace/cms-rate-reference";
import { CONFIRMED_NO_2026_RATE } from "@workspace/cms-rate-reference";
import { eq, sql } from "drizzle-orm";
import {
  assertCms2026CountyRateCoverage,
  type CountyRateCoverage,
} from "./verify-cms-2026-rate-book-coverage";

export const RATE_YEAR = 2026;
const RATE_BOOK_URL = "https://www.cms.gov/files/zip/2026-ma-rate-book.zip";
const CSV_ARCHIVE_PATH = "CSV/CountyRate2026.csv";

/**
 * Tracked FIPS that require an explicit CMS-published rate-book crosswalk.
 * These are the 11 mapped benchmarks restored by the targeted recovery
 * command. Rose Island (60030) remains in RATE_BOOK_CROSSWALK for source
 * reconciliation but is not in the current tracked county universe.
 */
export const RESTORED_2026_MAPPED_BENCHMARK_FIPS = [
  "02270",
  "22059",
  "46113",
  "60010",
  "60020",
  "60040",
  "60050",
  "66010",
  "69085",
  "78010",
  "78020",
] as const;

export type CmsCountyRate = {
  code: string;
  stateName: string;
  countyName: string;
  rate5Star: number;
  rate3_5Star: number;
  rate0Star: number;
  esrdRate: number;
};

export type TrackedCounty = {
  fips: string;
  countyName: string;
  stateName: string;
};

export type CountyRateRecord = {
  county_fips: string;
  year: number;
  cms_county_code: string;
  rate_5_star: string;
  rate_3_5_star: string;
  rate_0_star: string;
  esrd_rate: string;
};

export type CountyRateReplacementTransaction = {
  replaceYear(records: CountyRateRecord[]): Promise<void>;
  loadCoverage(): Promise<CountyRateCoverage>;
};

export type CountyRateReplacementRunner = (
  operation: (transaction: CountyRateReplacementTransaction) => Promise<void>,
) => Promise<void>;

/**
 * Replaces the active benchmark set only after the staged rows satisfy the
 * fixed CMS coverage contract. The supplied transaction runner must commit
 * only after the operation resolves, so a validation error preserves the
 * previously verified set.
 */
export async function replaceVerifiedCms2026CountyRates(
  records: CountyRateRecord[],
  runTransaction: CountyRateReplacementRunner,
): Promise<void> {
  await runTransaction(async (transaction) => {
    await transaction.replaceYear(records);
    assertCms2026CountyRateCoverage(await transaction.loadCoverage());
  });
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }

  fields.push(field);
  return fields;
}

function parseRate(value: string): number {
  const rate = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(rate)) {
    throw new Error(`Invalid CMS rate: ${value}`);
  }
  return rate;
}

export function normalizeCountyName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bSAINT\b/g, "ST")
    .replace(/\b(COUNTY|PARISH|MUNICIPALITY|BOROUGH|CENSUS AREA)\b/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function countyMatchKey(stateName: string, countyName: string): string {
  const normalizedStateName = stateName.trim().toUpperCase();
  const normalizedName =
    normalizedStateName === "MARYLAND" &&
    normalizeCountyName(countyName) === "PRINCEGEORGE"
      ? "PRINCEGEORGES"
      : normalizeCountyName(countyName);

  return `${normalizedStateName}|${normalizedName}`;
}

export async function downloadRateBook(): Promise<string> {
  const cacheDir = join(tmpdir(), "cms-ma-rate-book-2026");
  const archivePath = join(cacheDir, "2026-ma-rate-book.zip");
  const csvPath = join(cacheDir, "CountyRate2026.csv");

  await mkdir(cacheDir, { recursive: true });
  const response = await fetch(RATE_BOOK_URL);
  if (!response.ok) {
    throw new Error(
      `CMS rate book download failed: ${response.status} ${response.statusText}`,
    );
  }

  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  await promisify(execFile)("unzip", ["-p", archivePath, CSV_ARCHIVE_PATH], {
    maxBuffer: 10 * 1024 * 1024,
  }).then(({ stdout }) => writeFile(csvPath, stdout));

  return readFile(csvPath, "utf8");
}

export function parseRateBook(csv: string): CmsCountyRate[] {
  const lines = csv.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) =>
    line.startsWith("Code,State,County Name,"),
  );
  if (headerIndex < 0) {
    throw new Error("CMS CountyRate2026.csv header was not found");
  }

  return lines
    .slice(headerIndex + 1)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine)
    .filter((fields) => fields.length === 7 && fields[0].trim().length > 0)
    .map((fields) => ({
      code: fields[0],
      stateName: fields[1],
      countyName: fields[2],
      rate5Star: parseRate(fields[3]),
      rate3_5Star: parseRate(fields[4]),
      rate0Star: parseRate(fields[5]),
      esrdRate: parseRate(fields[6]),
    }));
}

/**
 * CMS 2026 rate-book rows that establish a benchmark mapping the state/county
 * name join cannot make on its own. Every entry cites where the published
 * source itself asserts the relationship — no successor rate is inferred by
 * name similarity. `cmsCode` selects the single published row for that
 * geography; `cmsStateName` collapses every row CMS publishes for a territory
 * whose rates are uniform (the build fails if they ever diverge).
 */
export const RATE_BOOK_CROSSWALK: Record<
  string,
  { cmsCode?: string; cmsStateName?: string; source: string }
> = {
  // The 2026 rate book keeps the legacy SSA code and prints the legacy county
  // name with the successor in parentheses on the same row.
  "02270": {
    cmsCode: "02270",
    source: 'Rate book row 02270 "WADE HAMPTON (KUSILVAK)", Alaska',
  },
  "22059": {
    cmsCode: "19290",
    source: 'Rate book row 19290 "LA SALLE (LASALLE)", Louisiana',
  },
  "46113": {
    cmsCode: "43560",
    source: 'Rate book row 43560 "SHANNON (OGLALA LAKOTA)", South Dakota',
  },
  // The rate book publishes U.S. Virgin Islands rows under the state name
  // "VIRGIN ISLANDS"; the county names match directly.
  "78010": {
    cmsCode: "48010",
    source: 'Rate book row 48010 "ST. CROIX", Virgin Islands',
  },
  "78020": {
    cmsCode: "48020",
    source: 'Rate book row 48020 "ST. JOHN", Virgin Islands',
  },
  // CMS publishes one territory-wide American Samoa row (code 64XXX,
  // county name "AMERICAN SAMOA") covering every county-equivalent district.
  "60010": {
    cmsCode: "64XXX",
    source: 'Territory-wide rate book row 64XXX "AMERICAN SAMOA"',
  },
  "60020": {
    cmsCode: "64XXX",
    source: 'Territory-wide rate book row 64XXX "AMERICAN SAMOA"',
  },
  "60030": {
    cmsCode: "64XXX",
    source: 'Territory-wide rate book row 64XXX "AMERICAN SAMOA"',
  },
  "60040": {
    cmsCode: "64XXX",
    source: 'Territory-wide rate book row 64XXX "AMERICAN SAMOA"',
  },
  "60050": {
    cmsCode: "64XXX",
    source: 'Territory-wide rate book row 64XXX "AMERICAN SAMOA"',
  },
  // CMS publishes one Northern Mariana Islands row (code 63050) for the
  // whole commonwealth.
  "69085": {
    cmsCode: "63050",
    source: 'Territory-wide rate book row 63050 "NORTHERN MARIANA ISLAND"',
  },
  // CMS publishes Guam as per-village rows under state "GU" with a single
  // uniform territory rate; the collapse below fails if they ever diverge.
  "66010": {
    cmsStateName: "GU",
    source: 'Rate book state "GU" village rows (uniform territory rate)',
  },
};

function ratesMatch(left: CmsCountyRate, right: CmsCountyRate): boolean {
  return (
    left.rate5Star === right.rate5Star &&
    left.rate3_5Star === right.rate3_5Star &&
    left.rate0Star === right.rate0Star &&
    left.esrdRate === right.esrdRate
  );
}

/**
 * Resolves one CMS rate-book benchmark for every tracked county before any
 * import write can occur. Some CMS county codes share the same county name;
 * identical duplicate rows are safe to collapse, but differing rates are not.
 */
export function buildCountyRateRecords(
  appCounties: TrackedCounty[],
  cmsRates: CmsCountyRate[],
  year = RATE_YEAR,
): { records: CountyRateRecord[]; confirmedGaps: string[] } {
  const cmsRatesByCounty = new Map<string, CmsCountyRate[]>();
  const cmsRatesByCode = new Map<string, CmsCountyRate[]>();
  const cmsRatesByState = new Map<string, CmsCountyRate[]>();
  for (const rate of cmsRates) {
    const key = countyMatchKey(rate.stateName, rate.countyName);
    cmsRatesByCounty.set(key, [...(cmsRatesByCounty.get(key) ?? []), rate]);
    cmsRatesByCode.set(rate.code, [
      ...(cmsRatesByCode.get(rate.code) ?? []),
      rate,
    ]);
    const stateKey = rate.stateName.trim().toUpperCase();
    cmsRatesByState.set(stateKey, [
      ...(cmsRatesByState.get(stateKey) ?? []),
      rate,
    ]);
  }

  const unresolved: string[] = [];
  const conflicting: string[] = [];
  const confirmedGaps: string[] = [];
  const staleGapEntries: string[] = [];
  const records = appCounties.flatMap((county) => {
    const directMatches = cmsRatesByCounty.get(
      countyMatchKey(county.stateName, county.countyName),
    );
    const label = `${county.fips} (${county.countyName}, ${county.stateName})`;

    const gapReason = CONFIRMED_NO_2026_RATE[county.fips];
    if (gapReason !== undefined) {
      if (directMatches?.length) {
        // The source now publishes a direct match for a geography documented
        // as uncovered — fail so the entry is re-reviewed, not overridden.
        staleGapEntries.push(label);
        return [];
      }
      confirmedGaps.push(`${label}: ${gapReason}`);
      return [];
    }

    const crosswalk = RATE_BOOK_CROSSWALK[county.fips];
    const matches = crosswalk
      ? crosswalk.cmsCode !== undefined
        ? cmsRatesByCode.get(crosswalk.cmsCode)
        : cmsRatesByState.get(crosswalk.cmsStateName!.trim().toUpperCase())
      : directMatches;
    if (!matches?.length) {
      unresolved.push(label);
      return [];
    }

    const rate = matches[0];
    if (!matches.every((match) => ratesMatch(match, rate))) {
      conflicting.push(label);
      return [];
    }

    return [
      {
        county_fips: county.fips,
        year,
        cms_county_code: rate.code,
        rate_5_star: String(rate.rate5Star),
        rate_3_5_star: String(rate.rate3_5Star),
        rate_0_star: String(rate.rate0Star),
        esrd_rate: String(rate.esrdRate),
      },
    ];
  });

  if (
    unresolved.length > 0 ||
    conflicting.length > 0 ||
    staleGapEntries.length > 0
  ) {
    const messages = [
      unresolved.length > 0
        ? `No direct CMS ${year} rate-book match for ${unresolved.length} tracked county-equivalents:\n${unresolved.join("\n")}`
        : null,
      conflicting.length > 0
        ? `${conflicting.length} tracked county-equivalents have conflicting CMS ${year} rates:\n${conflicting.join("\n")}`
        : null,
      staleGapEntries.length > 0
        ? `${staleGapEntries.length} county-equivalents documented as having no CMS ${year} rate now match a published row — re-review CONFIRMED_NO_2026_RATE:\n${staleGapEntries.join("\n")}`
        : null,
    ].filter((message): message is string => message !== null);
    throw new Error(messages.join("\n\n"));
  }

  if (records.length !== appCounties.length - confirmedGaps.length) {
    throw new Error(
      `Expected ${appCounties.length - confirmedGaps.length} CMS ${year} county benchmarks but built ${records.length}`,
    );
  }

  return { records, confirmedGaps };
}

function restoredMappedBenchmarkRecords(
  records: CountyRateRecord[],
): CountyRateRecord[] {
  const restoredFips = new Set<string>(RESTORED_2026_MAPPED_BENCHMARK_FIPS);
  const restoredRecords = records.filter((record) =>
    restoredFips.has(record.county_fips),
  );
  const restoredRecordFips = new Set(
    restoredRecords.map((record) => record.county_fips),
  );
  const missingFips = RESTORED_2026_MAPPED_BENCHMARK_FIPS.filter(
    (fips) => !restoredRecordFips.has(fips),
  );

  if (missingFips.length > 0) {
    throw new Error(
      `CMS ${RATE_YEAR} mapped benchmark recovery did not build all expected FIPS: ${missingFips.join(", ")}`,
    );
  }

  return restoredRecords;
}

async function persistCountyRateRecords(
  records: CountyRateRecord[],
  replaceYear: boolean,
): Promise<void> {
  if (replaceYear) {
    await replaceVerifiedCms2026CountyRates(records, async (operation) =>
      db.transaction(async (tx) =>
        operation({
          replaceYear: async (replacementRecords) => {
            // The active rows are replaced only inside this transaction. A
            // coverage error after these writes rolls the transaction back.
            await tx
              .delete(countyRatesTable)
              .where(eq(countyRatesTable.year, RATE_YEAR));

            await tx.insert(countyRatesTable).values(replacementRecords);
          },
          loadCoverage: async () => {
            const [counties, rates] = await Promise.all([
              tx.select({ fips: countiesTable.fips }).from(countiesTable),
              tx
                .select({ fips: countyRatesTable.county_fips })
                .from(countyRatesTable)
                .where(eq(countyRatesTable.year, RATE_YEAR)),
            ]);
            return {
              countyFips: counties.map((county) => county.fips),
              rateFips: rates.map((rate) => rate.fips),
            };
          },
        }),
      ),
    );
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(countyRatesTable)
      .values(records)
      .onConflictDoUpdate({
        target: [countyRatesTable.county_fips, countyRatesTable.year],
        set: {
          cms_county_code: sql`excluded.cms_county_code`,
          rate_5_star: sql`excluded.rate_5_star`,
          rate_3_5_star: sql`excluded.rate_3_5_star`,
          rate_0_star: sql`excluded.rate_0_star`,
          esrd_rate: sql`excluded.esrd_rate`,
        },
      });
  });
}

async function loadCms2026CountyRateRecords(): Promise<{
  records: CountyRateRecord[];
  confirmedGaps: string[];
}> {
  const [csv, appCounties] = await Promise.all([
    downloadRateBook(),
    db
      .select({
        fips: countiesTable.fips,
        countyName: countiesTable.county_name,
        stateName: countiesTable.state_name,
      })
      .from(countiesTable),
  ]);
  return buildCountyRateRecords(appCounties, parseRateBook(csv));
}

export async function restoreCms2026MappedBenchmarks(): Promise<void> {
  const { records } = await loadCms2026CountyRateRecords();
  const restoredRecords = restoredMappedBenchmarkRecords(records);
  await persistCountyRateRecords(restoredRecords, false);

  console.log(
    `Restored ${restoredRecords.length} mapped county benchmarks from the CMS ${RATE_YEAR} MA Rate Book: ${restoredRecords
      .map((record) => record.county_fips)
      .join(", ")}.`,
  );
}

async function main(): Promise<void> {
  const { records, confirmedGaps } = await loadCms2026CountyRateRecords();
  await persistCountyRateRecords(records, true);
  console.log(
    `Imported ${records.length} county benchmarks from the CMS ${RATE_YEAR} MA Rate Book.`,
  );
  if (confirmedGaps.length > 0) {
    console.log(
      `${confirmedGaps.length} tracked county-equivalents have no CMS ${RATE_YEAR} rate-book row (benchmark intentionally left null):\n${confirmedGaps.join("\n")}`,
    );
  }
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
