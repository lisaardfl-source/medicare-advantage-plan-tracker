import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { pool } from "@workspace/db";

const YEAR = 2026;
const EXPECTED_REPORT_PERIOD = "2026-01";
const INPUT_PATH = process.env.CMS_LOOK_ALIKE_CSV_PATH;
const REPORT_PERIOD = process.env.CMS_LOOK_ALIKE_REPORT_PERIOD;
const SOURCE_URL =
  process.env.CMS_LOOK_ALIKE_SOURCE_URL ??
  "https://www.cms.gov/files/document/cy25dsnplookaliketransitionmemo040524g.pdf";
export const LOOK_ALIKE_THRESHOLD_PCT = 70;

type ColumnIndex = Record<string, number>;
export type SourceRow = {
  contractId: string;
  planId: string;
  dualEligibleEnrollment: number | null;
  totalEnrollment: number | null;
  dualEligiblePct: number | null;
  status: "available" | "suppressed" | "unknown";
  meetsLookAlikeRule: boolean;
};

type ParsedCmsNumber = {
  value: number | null;
  status: "available" | "suppressed" | "unknown";
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else value += character;
  }
  values.push(value.trim());
  return values;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePlanId(value: string): string {
  return value.trim().replace(/^0+(?=\d)/, "");
}

function getColumn(columns: ColumnIndex, names: string[]): number {
  for (const name of names) {
    const index = columns[normalizeHeader(name)];
    if (index !== undefined) return index;
  }
  return -1;
}

function parseCmsNumber(value: string | undefined): ParsedCmsNumber {
  const normalized = value?.trim().replaceAll(",", "") ?? "";
  if (/^(?:\*|suppressed)$/i.test(normalized)) {
    return { value: null, status: "suppressed" };
  }
  if (!normalized || /^n\/?a$/i.test(normalized)) {
    return { value: null, status: "unknown" };
  }
  const numeric = Number(normalized.replace(/%$/, ""));
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Invalid CMS enrollment value: ${value}`);
  }
  return { value: numeric, status: "available" };
}

function parseCmsBoolean(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

export function normalizeDualEligiblePct(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function reportedPercentageTolerance(value: string | undefined): number {
  const normalized = value?.trim().replace(/%$/, "") ?? "";
  const decimalPlaces = normalized.includes(".")
    ? (normalized.split(".")[1]?.length ?? 0)
    : 0;
  return 0.5 * 10 ** -decimalPlaces + 0.0000005;
}

export function meetsLookAlikeRule(input: {
  dualEligiblePct: number | null;
  totalEnrollment: number | null;
  cmsDetermination: boolean | null;
  activeLessThanOneYear: boolean | null;
}): boolean {
  if (
    input.dualEligiblePct === null ||
    input.dualEligiblePct < LOOK_ALIKE_THRESHOLD_PCT
  ) {
    return false;
  }
  if (input.cmsDetermination !== null) return input.cmsDetermination;
  if (input.activeLessThanOneYear === null) {
    throw new Error(
      "A threshold-matching plan requires a CMS determination or plan-age indicator.",
    );
  }
  if (input.activeLessThanOneYear) {
    throw new Error(
      "A threshold-matching new plan requires CMS's final look-alike determination; January enrollment cannot resolve the small-plan exception.",
    );
  }
  return true;
}

export function readRows(content: string): SourceRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CMS look-alike CSV has no data rows.");
  const columns = Object.fromEntries(
    parseCsvLine(lines[0]).map((header, index) => [normalizeHeader(header), index]),
  );
  const contractIndex = getColumn(columns, ["contract number", "contract id"]);
  const planIndex = getColumn(columns, ["plan id", "pbp", "pbp number"]);
  const dualCountIndex = getColumn(columns, [
    "dual eligible enrollment",
    "dual enrollment",
    "dual eligible count",
  ]);
  const totalIndex = getColumn(columns, ["total enrollment", "enrollment"]);
  const dualPctIndex = getColumn(columns, [
    "dual eligible percentage",
    "dual eligible percent",
    "dual eligible pct",
    "dual enrollment percentage",
  ]);
  const determinationIndex = getColumn(columns, [
    "look alike indicator",
    "look alike determination",
    "cms look alike",
  ]);
  const newPlanIndex = getColumn(columns, [
    "active less than one year",
    "new plan indicator",
  ]);
  if (contractIndex < 0 || planIndex < 0 || (dualPctIndex < 0 && (dualCountIndex < 0 || totalIndex < 0))) {
    throw new Error(
      "CMS look-alike CSV must include Contract Number, Plan ID, and either a dual-eligible percentage or both dual-eligible and total enrollment.",
    );
  }

  const rows = lines.slice(1).map((line, rowIndex) => {
    const fields = parseCsvLine(line);
    const contractId = fields[contractIndex]?.trim();
    const planId = normalizePlanId(fields[planIndex] ?? "");
    if (!contractId || !planId) {
      throw new Error(`CMS look-alike CSV row ${rowIndex + 2} is missing a contract or plan ID.`);
    }
    const dualCount =
      dualCountIndex >= 0
        ? parseCmsNumber(fields[dualCountIndex])
        : { value: null, status: "unknown" as const };
    const total =
      totalIndex >= 0
        ? parseCmsNumber(fields[totalIndex])
        : { value: null, status: "unknown" as const };
    const reportedPct =
      dualPctIndex >= 0
        ? parseCmsNumber(fields[dualPctIndex])
        : { value: null, status: "unknown" as const };
    const dualEligibleEnrollment = dualCount.value;
    const totalEnrollment = total.value;
    if (
      dualEligibleEnrollment !== null &&
      totalEnrollment !== null &&
      dualEligibleEnrollment > totalEnrollment
    ) {
      throw new Error(
        `CMS look-alike CSV row ${rowIndex + 2} has dual-eligible enrollment above total enrollment.`,
      );
    }
    if (
      reportedPct.value !== null &&
      totalEnrollment !== null &&
      totalEnrollment <= 0
    ) {
      throw new Error(
        `CMS look-alike CSV row ${rowIndex + 2} reports a percentage with zero total enrollment.`,
      );
    }
    const calculatedPct =
      dualEligibleEnrollment !== null &&
      totalEnrollment !== null &&
      totalEnrollment > 0
        ? normalizeDualEligiblePct(
            (dualEligibleEnrollment / totalEnrollment) * 100,
          )
        : null;
    const normalizedReportedPct =
      reportedPct.value === null
        ? null
        : normalizeDualEligiblePct(reportedPct.value);
    if (normalizedReportedPct !== null && calculatedPct !== null) {
      const tolerance = reportedPercentageTolerance(fields[dualPctIndex]);
      const crossesThreshold =
        (normalizedReportedPct >= LOOK_ALIKE_THRESHOLD_PCT) !==
        (calculatedPct >= LOOK_ALIKE_THRESHOLD_PCT);
      if (
        Math.abs(normalizedReportedPct - calculatedPct) > tolerance ||
        crossesThreshold
      ) {
        throw new Error(
          `CMS look-alike CSV row ${rowIndex + 2} has a reported percentage inconsistent with dual and total enrollment.`,
        );
      }
    }
    const rawDualEligiblePct = calculatedPct ?? normalizedReportedPct;
    const dualEligiblePct =
      rawDualEligiblePct === null
        ? null
        : normalizeDualEligiblePct(rawDualEligiblePct);
    if (dualEligiblePct !== null && dualEligiblePct > 100) {
      throw new Error(`CMS look-alike CSV row ${rowIndex + 2} has a percentage above 100.`);
    }
    const cmsDetermination =
      determinationIndex >= 0 ? parseCmsBoolean(fields[determinationIndex]) : null;
    const activeLessThanOneYear =
      newPlanIndex >= 0 ? parseCmsBoolean(fields[newPlanIndex]) : null;
    const status: SourceRow["status"] =
      dualEligiblePct !== null
        ? "available"
        : [reportedPct.status, dualCount.status, total.status].includes("suppressed")
          ? "suppressed"
          : "unknown";
    return {
      contractId,
      planId,
      dualEligibleEnrollment,
      totalEnrollment,
      dualEligiblePct,
      status,
      meetsLookAlikeRule: meetsLookAlikeRule({
        dualEligiblePct,
        totalEnrollment,
        cmsDetermination,
        activeLessThanOneYear,
      }),
    };
  });
  const uniqueRows = new Map<string, SourceRow>();
  for (const row of rows) {
    const key = `${row.contractId.toUpperCase()}:${row.planId}`;
    const previous = uniqueRows.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) {
      throw new Error(`Conflicting CMS look-alike rows for ${key}.`);
    }
    uniqueRows.set(key, row);
  }
  return [...uniqueRows.values()];
}

async function main(): Promise<void> {
  if (!INPUT_PATH) {
    throw new Error("CMS_LOOK_ALIKE_CSV_PATH is required; CPSC does not include dual-eligible enrollment.");
  }
  if (REPORT_PERIOD !== EXPECTED_REPORT_PERIOD) {
    throw new Error(
      `CMS_LOOK_ALIKE_REPORT_PERIOD must be ${EXPECTED_REPORT_PERIOD}; received ${REPORT_PERIOD ?? "no value"}.`,
    );
  }
  const rows = readRows(await readFile(INPUT_PATH, "utf8"));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE plans
       SET is_look_alike = false,
           dual_eligible_enrollment = NULL,
           look_alike_total_enrollment = NULL,
           dual_eligible_pct = NULL,
           dual_eligible_data_status = 'unknown',
           dual_eligible_source_url = $2
       WHERE year = $1`,
      [YEAR, SOURCE_URL],
    );
    let matched = 0;
    for (const row of rows) {
      const result = await client.query(
        `UPDATE plans
         SET dual_eligible_enrollment = $4,
             look_alike_total_enrollment = $5,
             dual_eligible_pct = $6,
             dual_eligible_data_status = $7,
             dual_eligible_source_url = $8,
             is_look_alike = CASE
               WHEN plan_type = 'regular' AND $9 THEN true
               ELSE false
             END
         WHERE year = $1
           AND contract_id = $2
           AND COALESCE(NULLIF(ltrim(plan_id, '0'), ''), '0') = $3`,
        [
          YEAR,
          row.contractId,
          row.planId,
          row.dualEligibleEnrollment,
          row.totalEnrollment,
          row.dualEligiblePct,
          row.status,
          SOURCE_URL,
          row.meetsLookAlikeRule,
        ],
      );
      matched += result.rowCount ?? 0;
    }
    if (matched === 0) {
      throw new Error(
        `No CMS look-alike rows matched CY${YEAR} plans; refusing to replace existing assessments.`,
      );
    }
    await client.query("COMMIT");
    process.stdout.write(
      `Processed ${rows.length} CMS rows; matched ${matched} CY${YEAR} plans.\n`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack : String(error)}\n`,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}