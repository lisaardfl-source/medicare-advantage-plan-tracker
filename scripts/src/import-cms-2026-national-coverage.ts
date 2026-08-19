import { mkdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { pool } from "@workspace/db";

const YEAR = 2026;
const CPSC_URL =
  process.env.CMS_CPSC_URL ??
  "https://www.cms.gov/files/zip/monthly-enrollment-cpsc-august-2026.zip";
const LOCAL_ARCHIVE = process.env.CMS_CPSC_ARCHIVE_PATH;
const ARCHIVE_ENTRY =
  "CPSC_Enrollment_2026_08/CPSC_Enrollment_Info_2026_08.csv";
const BATCH_SIZE = 2_000;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AS: "American Samoa",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  GU: "Guam",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  MP: "Northern Mariana Islands",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  PR: "Puerto Rico",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VI: "U.S. Virgin Islands",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

// CMS uses village names for several territory FIPS codes. These are
// county-equivalent FIPS codes, so keep the canonical county-equivalent name
// instead of whichever village happened to appear first in the source file.
const TERRITORY_COUNTY_NAMES: Record<string, string> = {
  "60010": "Eastern District",
  "60020": "Manu'a District",
  "60030": "Rose Island",
  "60040": "Swains Island",
  "60050": "Western District",
  "66010": "Guam",
  "69085": "Northern Islands Municipality",
};

type CountyRecord = {
  fips: string;
  countyName: string;
  stateCode: string;
  stateName: string;
};

type EnrollmentRecord = CountyRecord & {
  contractId: string;
  planId: string;
  beneficiaryCount: number;
};

type TransactionClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  release(): void;
};

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

function normalizePlanId(value: string): string {
  return value.trim().replace(/^0+(?=\d)/, "");
}

function normalizeFips(value: string): string {
  return value.trim().padStart(5, "0");
}

function canonicalCountyName(fips: string, sourceName: string): string {
  return TERRITORY_COUNTY_NAMES[fips] ?? sourceName.trim();
}

async function downloadArchive(): Promise<string> {
  if (LOCAL_ARCHIVE) {
    return LOCAL_ARCHIVE;
  }

  const cacheDir = join(tmpdir(), "cms-cpsc-2026");
  const archivePath = join(cacheDir, "monthly-enrollment-cpsc-august-2026.zip");
  await mkdir(cacheDir, { recursive: true });

  const response = await fetch(CPSC_URL);
  if (!response.ok) {
    throw new Error(
      `CMS CPSC download failed: ${response.status} ${response.statusText}`,
    );
  }

  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  return archivePath;
}

async function* csvRows(archivePath: string): AsyncGenerator<string[]> {
  const unzip = spawn("unzip", ["-p", archivePath, ARCHIVE_ENTRY], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  unzip.stdout.setEncoding("latin1");
  const errors: string[] = [];
  unzip.stderr.setEncoding("utf8");
  unzip.stderr.on("data", (chunk: string) => errors.push(chunk));

  const input = createInterface({
    input: unzip.stdout,
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  try {
    for await (const line of input) {
      if (line.trim()) {
        yield parseCsvLine(line);
      }
    }
  } finally {
    input.close();
  }

  const [exitCode] = (await once(unzip, "close")) as [number];
  if (exitCode !== 0) {
    throw new Error(
      `Could not read ${ARCHIVE_ENTRY} from ${archivePath}: ${errors.join("")}`,
    );
  }
}

function makeCountyRecord(fields: string[]): CountyRecord | null {
  const fips = normalizeFips(fields[3] ?? "");
  const stateCode = (fields[4] ?? "").trim().toUpperCase();
  const sourceCountyName = (fields[5] ?? "").trim();
  const stateName = STATE_NAMES[stateCode];

  if (
    !/^\d{5}$/.test(fips) ||
    !stateCode ||
    !sourceCountyName ||
    !stateName
  ) {
    return null;
  }

  return {
    fips,
    countyName: canonicalCountyName(fips, sourceCountyName),
    stateCode,
    stateName,
  };
}

async function readCpscData(archivePath: string): Promise<{
  counties: CountyRecord[];
  enrollments: EnrollmentRecord[];
}> {
  const counties = new Map<string, CountyRecord>();
  const enrollmentsByPlanCounty = new Map<string, EnrollmentRecord>();
  const sourceRows = new Map<string, number>();
  let rowCount = 0;
  let skippedMalformedRows = 0;

  for await (const fields of csvRows(archivePath)) {
    if (rowCount === 0) {
      rowCount += 1;
      continue;
    }
    rowCount += 1;

    const county = makeCountyRecord(fields);
    if (!county) {
      skippedMalformedRows += 1;
      continue;
    }

    const previous = counties.get(county.fips);
    if (
      previous &&
      (previous.stateCode !== county.stateCode ||
        previous.stateName !== county.stateName ||
        previous.countyName !== county.countyName)
    ) {
      // Territory aliases are normalized above. Any remaining conflict would
      // indicate a source change that should be investigated, not guessed.
      throw new Error(
        `Conflicting CMS county metadata for ${county.fips}: ` +
          `${previous.stateCode}/${previous.countyName} vs ` +
          `${county.stateCode}/${county.countyName}`,
      );
    }
    counties.set(county.fips, county);

    const rawEnrollment = (fields[6] ?? "").trim().replaceAll(",", "");
    const beneficiaryCount = Number(rawEnrollment);
    const contractId = (fields[0] ?? "").trim();
    const planId = normalizePlanId(fields[1] ?? "");
    const ssaCountyCode = (fields[2] ?? "").trim();
    if (
      !contractId ||
      !planId ||
      !Number.isInteger(beneficiaryCount) ||
      beneficiaryCount <= 0
    ) {
      continue;
    }

    const sourceKey = `${contractId}:${planId}:${ssaCountyCode}:${county.fips}`;
    const previousSourceCount = sourceRows.get(sourceKey);
    if (previousSourceCount !== undefined) {
      if (previousSourceCount !== beneficiaryCount) {
        throw new Error(
          `Conflicting CMS enrollment rows for ${sourceKey}: ` +
            `${previousSourceCount} vs ${beneficiaryCount}`,
        );
      }
      continue;
    }
    sourceRows.set(sourceKey, beneficiaryCount);

    // CMS can report multiple SSA county codes against the same geographic
    // FIPS. Enrollment is county-residence based, so those rows must be
    // summed before calculating a plan's county market share.
    const planCountyKey = `${contractId}:${planId}:${county.fips}`;
    const priorEnrollment = enrollmentsByPlanCounty.get(planCountyKey);
    if (priorEnrollment) {
      priorEnrollment.beneficiaryCount += beneficiaryCount;
    } else {
      enrollmentsByPlanCounty.set(planCountyKey, {
        ...county,
        contractId,
        planId,
        beneficiaryCount,
      });
    }
  }

  console.log(
    `Read ${rowCount.toLocaleString()} CMS rows; ` +
      `${skippedMalformedRows.toLocaleString()} rows lacked county metadata.`,
  );

  return {
    counties: [...counties.values()].sort((a, b) =>
      a.fips.localeCompare(b.fips),
    ),
    enrollments: [...enrollmentsByPlanCounty.values()],
  };
}

function buildValues(
  rows: Array<Array<string | number>>,
): { text: string; values: Array<string | number> } {
  const values: Array<string | number> = [];
  const groups = rows.map((row, rowIndex) => {
    const placeholders = row.map((value, columnIndex) => {
      values.push(value);
      return `$${rowIndex * row.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  return { text: groups.join(", "), values };
}

async function insertCounties(
  client: TransactionClient,
  counties: CountyRecord[],
): Promise<void> {
  for (let offset = 0; offset < counties.length; offset += BATCH_SIZE) {
    const batch = counties.slice(offset, offset + BATCH_SIZE);
    const queryRows = batch.map((county) => [
      county.fips,
      county.countyName,
      county.stateCode,
      county.stateName,
    ]);
    const values = buildValues(queryRows);
    await client.query(
      `INSERT INTO counties (fips, county_name, state_code, state_name)
       VALUES ${values.text}
       ON CONFLICT (fips) DO UPDATE SET
         county_name = EXCLUDED.county_name,
         state_code = EXCLUDED.state_code,
         state_name = EXCLUDED.state_name`,
      values.values,
    );
  }
}

async function insertEnrollments(
  client: TransactionClient,
  rows: Array<{ planId: number; countyFips: string; count: number }>,
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const queryRows = batch.map((row) => [
      row.planId,
      row.countyFips,
      row.count,
      YEAR,
    ]);
    const values = buildValues(queryRows);
    await client.query(
      `INSERT INTO enrollments (plan_id, county_fips, beneficiary_count, year)
       VALUES ${values.text}`,
      values.values,
    );
  }
}

async function main(): Promise<void> {
  const archivePath = await downloadArchive();
  const { counties, enrollments } = await readCpscData(archivePath);
  if (counties.length < 3_000) {
    throw new Error(
      `Refusing to import only ${counties.length} counties; expected national coverage.`,
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planResult = await client.query<{
      id: number;
      contract_id: string;
      plan_id: string;
    }>("SELECT id, contract_id, plan_id FROM plans WHERE year = $1", [YEAR]);
    const plans = new Map(
      planResult.rows.map((plan) => [
        `${plan.contract_id}:${normalizePlanId(plan.plan_id)}`,
        plan.id,
      ]),
    );

    const matchedEnrollments: Array<{
      planId: number;
      countyFips: string;
      count: number;
    }> = [];
    let unmatchedPlanRows = 0;
    for (const row of enrollments) {
      const planId = plans.get(`${row.contractId}:${row.planId}`);
      if (!planId) {
        unmatchedPlanRows += 1;
        continue;
      }
      matchedEnrollments.push({
        planId,
        countyFips: row.fips,
        count: row.beneficiaryCount,
      });
    }

    await client.query("DELETE FROM enrollments WHERE year = $1", [YEAR]);
    await insertCounties(client, counties);
    await insertEnrollments(client, matchedEnrollments);
    const verification = await client.query<{
      enrollment_rows: string;
      beneficiary_total: string;
    }>(
      `SELECT
         COUNT(*)::text AS enrollment_rows,
         COALESCE(SUM(beneficiary_count), 0)::text AS beneficiary_total
       FROM enrollments
       WHERE year = $1`,
      [YEAR],
    );
    const expectedBeneficiaries = matchedEnrollments.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    const imported = verification.rows[0];
    if (
      Number(imported.enrollment_rows) !== matchedEnrollments.length ||
      Number(imported.beneficiary_total) !== expectedBeneficiaries
    ) {
      throw new Error(
        `CMS enrollment reconciliation failed: expected ${matchedEnrollments.length} rows ` +
          `and ${expectedBeneficiaries} beneficiaries, imported ${imported.enrollment_rows} ` +
          `rows and ${imported.beneficiary_total} beneficiaries.`,
      );
    }
    await client.query("COMMIT");

    console.log(
      `Imported ${counties.length.toLocaleString()} counties and ` +
        `${matchedEnrollments.length.toLocaleString()} enrollment rows ` +
        `(${expectedBeneficiaries.toLocaleString()} beneficiaries) for CY${YEAR}.`,
    );
    console.log(
      `Skipped ${unmatchedPlanRows.toLocaleString()} positive CMS rows ` +
        "because they were not represented by the MA plan import.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    if (!LOCAL_ARCHIVE) {
      await rm(archivePath, { force: true });
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });