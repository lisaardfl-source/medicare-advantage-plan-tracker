import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import {
  countiesTable,
  db,
  enrollmentsTable,
  plansTable,
  pool,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const COST_YEAR = 2026;
const SOURCE = "CMS PBP Benefits 2026";
const SOURCE_URL = "https://www.cms.gov/files/zip/pbp-benefits-2026.zip";
const SECTION_D_PATH = "pbp_Section_D.txt";
const PLAN_AREA_PATH = "PlanArea.txt";

export type CmsCost = {
  contractId: string;
  planId: string;
  segmentId: number;
  version: number;
  monthlyPremium: number | null;
  moop: number | null;
  moopType: string | null;
};

export type PlanRecord = {
  id: number;
  contractId: string;
  planId: string;
};

type CountyCostRecord = {
  plan_id: number;
  county_fips: string;
  year: number;
  segment_id: number;
  monthly_premium: string | null;
  moop: string | null;
  moop_type: string | null;
  is_published: boolean;
  source: string;
  source_url: string;
  imported_at: Date;
};

export type PlanSummaryUpdate = {
  id: number;
  monthlyPremium: string | null;
  monthlyPremiumMin: string | null;
  monthlyPremiumMax: string | null;
  premiumVaries: boolean;
  premiumHasUnpublished: boolean;
  moop: string | null;
  moopMin: string | null;
  moopMax: string | null;
  moopType: string | null;
  moopVaries: boolean;
  moopHasUnpublished: boolean;
  varies: boolean;
  source: string | null;
  sourceUrl: string | null;
  importedAt: Date | null;
};

export function getCountyReplacementPlanIds(
  planUpdates: PlanSummaryUpdate[],
): number[] {
  return [...new Set(planUpdates.map((update) => update.id))];
}

function normalizePlanId(value: string): string {
  return value.trim().padStart(3, "0");
}

function planKey(contractId: string, planId: string): string {
  return `${contractId.trim().toUpperCase()}|${normalizePlanId(planId)}`;
}

function segmentKey(contractId: string, planId: string, segmentId: number): string {
  return `${planKey(contractId, planId)}|${segmentId}`;
}

function parsePublishedAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const amount = Number(trimmed.replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid CMS dollar amount: ${value}`);
  }
  return amount;
}

function normalizeCountyName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bSAINT\b/g, "ST")
    .replace(/\b(COUNTY|PARISH|MUNICIPALITY|BOROUGH|CENSUS AREA)\b/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function countyKey(stateCode: string, countyName: string): string {
  const state = stateCode.trim().toUpperCase();
  const rawName = normalizeCountyName(countyName);
  const name =
    state === "MD" && rawName === "PRINCEGEORGE"
      ? "PRINCEGEORGES"
      : rawName;
  return `${state}|${name}`;
}

function parseTsvLine(line: string): string[] {
  return line.replace(/\r$/, "").split("\t");
}

function requiredIndex(header: string[], name: string): number {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`CMS file is missing required column ${name}`);
  return index;
}

async function downloadAndExtract(): Promise<{
  sectionDPath: string;
  planAreaPath: string;
}> {
  const cacheDir = join(tmpdir(), "cms-pbp-benefits-2026");
  const archivePath = join(cacheDir, "pbp-benefits-2026.zip");
  const sectionDPath = join(cacheDir, SECTION_D_PATH);
  const planAreaPath = join(cacheDir, PLAN_AREA_PATH);
  await mkdir(cacheDir, { recursive: true });

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(
      `CMS PBP download failed: ${response.status} ${response.statusText}`,
    );
  }
  await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  await run("unzip", ["-o", "-j", archivePath, SECTION_D_PATH, "-d", cacheDir], {
    maxBuffer: 10 * 1024 * 1024,
  });
  await run("unzip", ["-o", "-j", archivePath, PLAN_AREA_PATH, "-d", cacheDir], {
    maxBuffer: 10 * 1024 * 1024,
  });

  return { sectionDPath, planAreaPath };
}

async function parseSectionD(path: string): Promise<Map<string, CmsCost>> {
  const content = await readFile(path, "utf8");
  const lines = content.split(/\n/).filter((line) => line.trim() !== "");
  const header = parseTsvLine(lines[0] ?? "");
  const contractIndex = requiredIndex(header, "pbp_a_hnumber");
  const planIndex = requiredIndex(header, "pbp_a_plan_identifier");
  const segmentIndex = requiredIndex(header, "segment_id");
  const versionIndex = requiredIndex(header, "version");
  const premiumIndex = requiredIndex(header, "pbp_d_mplusc_premium");
  const moopPublishedIndex = requiredIndex(header, "pbp_d_out_pocket_amt_yn");
  const moopTypeIndex = requiredIndex(header, "pbp_d_out_pocket_amt_type");
  const moopIndex = requiredIndex(header, "pbp_d_out_pocket_amt");

  const costs = new Map<string, CmsCost>();
  for (const line of lines.slice(1)) {
    const fields = parseTsvLine(line);
    const contractId = fields[contractIndex]?.trim().toUpperCase() ?? "";
    const planId = normalizePlanId(fields[planIndex] ?? "");
    const segmentId = Number(fields[segmentIndex]);
    const version = Number(fields[versionIndex] || 0);
    if (!contractId || !planId || !Number.isInteger(segmentId)) {
      throw new Error("CMS Section D contains an invalid plan key");
    }

    const publishedFlag = fields[moopPublishedIndex]?.trim();
    const cost: CmsCost = {
      contractId,
      planId,
      segmentId,
      version: Number.isFinite(version) ? version : 0,
      monthlyPremium: parsePublishedAmount(fields[premiumIndex] ?? ""),
      moop:
        publishedFlag === "1"
          ? parsePublishedAmount(fields[moopIndex] ?? "")
          : null,
      moopType: publishedFlag === "1" ? fields[moopTypeIndex]?.trim() || null : null,
    };
    const key = segmentKey(contractId, planId, segmentId);
    const existing = costs.get(key);
    if (!existing || cost.version > existing.version) costs.set(key, cost);
  }
  return costs;
}

function distinct(values: Array<number | null>): number[] {
  return [...new Set(values.filter((value): value is number => value != null))];
}

export function buildPlanSummaries(
  plans: PlanRecord[],
  costsBySegment: Map<string, CmsCost>,
): {
  matchedPlans: number;
  variedPlans: number;
  updates: PlanSummaryUpdate[];
} {
  const costsByPlan = new Map<string, CmsCost[]>();
  for (const cost of costsBySegment.values()) {
    const key = planKey(cost.contractId, cost.planId);
    const rows = costsByPlan.get(key) ?? [];
    rows.push(cost);
    costsByPlan.set(key, rows);
  }

  let matchedPlans = 0;
  let variedPlans = 0;
  const importedAt = new Date();
  const updates: PlanSummaryUpdate[] = [];

  for (const plan of plans) {
    const rows = costsByPlan.get(planKey(plan.contractId, plan.planId)) ?? [];
    if (rows.length === 0) continue;
    const premiums = distinct(rows.map((row) => row.monthlyPremium));
    const moops = distinct(rows.map((row) => row.moop));
    const moopTypes = [...new Set(rows.map((row) => row.moopType).filter(Boolean))];
    const premiumHasUnpublished = rows.some((row) => row.monthlyPremium == null);
    const moopHasUnpublished = rows.some((row) => row.moop == null);
    const premiumVaries =
      premiums.length > 1 || (premiums.length > 0 && premiumHasUnpublished);
    const moopVaries =
      moops.length > 1 ||
      moopTypes.length > 1 ||
      (moops.length > 0 && moopHasUnpublished);
    const varies = premiumVaries || moopVaries;
    matchedPlans += 1;
    if (varies) variedPlans += 1;
    updates.push({
      id: plan.id,
      monthlyPremium:
        premiums.length === 1 && !premiumHasUnpublished
          ? String(premiums[0])
          : null,
      monthlyPremiumMin:
        premiums.length > 0 ? String(Math.min(...premiums)) : null,
      monthlyPremiumMax:
        premiums.length > 0 ? String(Math.max(...premiums)) : null,
      premiumVaries,
      premiumHasUnpublished,
      moop:
        moops.length === 1 && !moopHasUnpublished ? String(moops[0]) : null,
      moopMin: moops.length > 0 ? String(Math.min(...moops)) : null,
      moopMax: moops.length > 0 ? String(Math.max(...moops)) : null,
      moopType: moopTypes.length === 1 ? moopTypes[0] : null,
      moopVaries,
      moopHasUnpublished,
      varies,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      importedAt,
    });
  }

  return { matchedPlans, variedPlans, updates };
}

async function buildCountyCosts(
  path: string,
  plans: PlanRecord[],
  costsBySegment: Map<string, CmsCost>,
): Promise<{
  records: CountyCostRecord[];
  enrolledPairs: number;
  unmatchedPairs: string[];
}> {
  const counties = await db.select().from(countiesTable);
  const countyFipsByKey = new Map(
    counties.map((county) => [
      countyKey(county.state_code, county.county_name),
      county.fips,
    ]),
  );
  const planByKey = new Map(plans.map((plan) => [planKey(plan.contractId, plan.planId), plan]));
  const enrollmentRows = await db
    .select({
      planId: enrollmentsTable.plan_id,
      countyFips: enrollmentsTable.county_fips,
    })
    .from(enrollmentsTable)
    .where(eq(enrollmentsTable.year, COST_YEAR));
  const enrolledPairs = new Set(
    enrollmentRows.map((row) => `${row.planId}|${row.countyFips}`),
  );

  const recordsByPair = new Map<string, CountyCostRecord>();
  const input = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  let indexes:
    | {
        contract: number;
        plan: number;
        segment: number;
        year: number;
        county: number;
        state: number;
      }
    | undefined;
  const importedAt = new Date();

  for await (const line of input) {
    if (!header) {
      header = parseTsvLine(line);
      indexes = {
        contract: requiredIndex(header, "contract_id"),
        plan: requiredIndex(header, "plan_id"),
        segment: requiredIndex(header, "segment_id"),
        year: requiredIndex(header, "contract_year"),
        county: requiredIndex(header, "county"),
        state: requiredIndex(header, "stcd"),
      };
      continue;
    }
    if (!indexes || line.trim() === "") continue;
    const fields = parseTsvLine(line);
    if (Number(fields[indexes.year]) !== COST_YEAR) continue;
    const plan = planByKey.get(
      planKey(fields[indexes.contract] ?? "", fields[indexes.plan] ?? ""),
    );
    if (!plan) continue;
    const countyFips = countyFipsByKey.get(
      countyKey(fields[indexes.state] ?? "", fields[indexes.county] ?? ""),
    );
    if (!countyFips) continue;
    const pair = `${plan.id}|${countyFips}`;
    if (!enrolledPairs.has(pair)) continue;
    const segmentId = Number(fields[indexes.segment]);
    const cmsCost = costsBySegment.get(
      segmentKey(plan.contractId, plan.planId, segmentId),
    );
    if (!cmsCost) continue;

    const record: CountyCostRecord = {
      plan_id: plan.id,
      county_fips: countyFips,
      year: COST_YEAR,
      segment_id: segmentId,
      monthly_premium:
        cmsCost.monthlyPremium != null ? String(cmsCost.monthlyPremium) : null,
      moop: cmsCost.moop != null ? String(cmsCost.moop) : null,
      moop_type: cmsCost.moopType,
      is_published:
        cmsCost.monthlyPremium != null || cmsCost.moop != null,
      source: SOURCE,
      source_url: SOURCE_URL,
      imported_at: importedAt,
    };
    const existing = recordsByPair.get(pair);
    if (
      existing &&
      (existing.monthly_premium !== record.monthly_premium ||
        existing.moop !== record.moop)
    ) {
      throw new Error(
        `CMS PlanArea maps multiple conflicting segments to plan/county ${pair}`,
      );
    }
    recordsByPair.set(pair, record);
  }

  const unmatchedPairs = [...enrolledPairs].filter(
    (pair) => !recordsByPair.has(pair),
  );
  return {
    records: [...recordsByPair.values()],
    enrolledPairs: enrolledPairs.size,
    unmatchedPairs,
  };
}

async function applyImport(
  planUpdates: PlanSummaryUpdate[],
  countyRecords: CountyCostRecord[],
): Promise<void> {
  const replacementPlanIds = getCountyReplacementPlanIds(planUpdates);
  if (replacementPlanIds.length === 0) {
    throw new Error("No matched plans are available for county-cost replacement");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const planBatchSize = 250;
    for (let start = 0; start < planUpdates.length; start += planBatchSize) {
      const batch = planUpdates.slice(start, start + planBatchSize);
      const params: unknown[] = [];
      const values = batch.map((update, rowIndex) => {
        const offset = rowIndex * 16;
        params.push(
          update.id,
          update.monthlyPremium,
          update.monthlyPremiumMin,
          update.monthlyPremiumMax,
          update.premiumVaries,
          update.premiumHasUnpublished,
          update.moop,
          update.moopMin,
          update.moopMax,
          update.moopType,
          update.moopVaries,
          update.moopHasUnpublished,
          update.varies,
          update.source,
          update.sourceUrl,
          update.importedAt,
        );
        return `(${Array.from({ length: 16 }, (_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
      });
      await client.query(
        `UPDATE plans AS p SET
           monthly_premium = v.monthly_premium::numeric,
           monthly_premium_min = v.monthly_premium_min::numeric,
           monthly_premium_max = v.monthly_premium_max::numeric,
           premium_varies_by_county = v.premium_varies::boolean,
           premium_has_unpublished_counties = v.premium_has_unpublished::boolean,
           moop = v.moop::numeric,
           moop_min = v.moop_min::numeric,
           moop_max = v.moop_max::numeric,
           moop_type = v.moop_type,
           moop_varies_by_county = v.moop_varies::boolean,
           moop_has_unpublished_counties = v.moop_has_unpublished::boolean,
           costs_vary_by_county = v.varies::boolean,
           cost_source = v.source,
           cost_source_url = v.source_url,
           cost_imported_at = v.imported_at::timestamptz
         FROM (VALUES ${values.join(", ")}) AS v(
           id, monthly_premium, monthly_premium_min, monthly_premium_max,
           premium_varies, premium_has_unpublished,
           moop, moop_min, moop_max, moop_type, moop_varies, moop_has_unpublished,
           varies, source, source_url, imported_at
         )
         WHERE p.id = v.id::integer`,
        params,
      );
    }

    await client.query(
      `DELETE FROM plan_county_costs
       WHERE year = $1
         AND plan_id = ANY($2::integer[])`,
      [COST_YEAR, replacementPlanIds],
    );
    const countyBatchSize = 500;
    for (let start = 0; start < countyRecords.length; start += countyBatchSize) {
      const batch = countyRecords.slice(start, start + countyBatchSize);
      const params: unknown[] = [];
      const values = batch.map((record, rowIndex) => {
        const offset = rowIndex * 11;
        params.push(
          record.plan_id,
          record.county_fips,
          record.year,
          record.segment_id,
          record.monthly_premium,
          record.moop,
          record.moop_type,
          record.is_published,
          record.source,
          record.source_url,
          record.imported_at,
        );
        return `(${Array.from({ length: 11 }, (_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
      });
      await client.query(
        `INSERT INTO plan_county_costs (
           plan_id, county_fips, year, segment_id, monthly_premium, moop,
           moop_type, is_published, source, source_url, imported_at
         ) VALUES ${values.join(", ")}`,
        params,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const { sectionDPath, planAreaPath } = await downloadAndExtract();
  const costsBySegment = await parseSectionD(sectionDPath);
  const planRows = await db
    .select({
      id: plansTable.id,
      contractId: plansTable.contract_id,
      planId: plansTable.plan_id,
    })
    .from(plansTable)
    .where(eq(plansTable.year, COST_YEAR));

  if (planRows.length === 0) {
    throw new Error(`No ${COST_YEAR} plans exist; refusing to import CMS costs`);
  }
  const summary = buildPlanSummaries(planRows, costsBySegment);
  const countyCosts = await buildCountyCosts(
    planAreaPath,
    planRows,
    costsBySegment,
  );
  const planCoverage = summary.matchedPlans / planRows.length;
  if (planCoverage < 0.95) {
    throw new Error(
      `Only ${summary.matchedPlans}/${planRows.length} plans matched CMS Section D; refusing to mutate data`,
    );
  }
  if (countyCosts.enrolledPairs === 0) {
    throw new Error(
      `No ${COST_YEAR} enrolled plan/county pairs exist; refusing to import incomplete county costs`,
    );
  }
  const coverage =
    countyCosts.records.length / countyCosts.enrolledPairs;
  if (coverage < 0.9) {
    throw new Error(
      `Only ${countyCosts.records.length}/${countyCosts.enrolledPairs} enrolled plan/county pairs matched CMS PBP data. ` +
        `Examples: ${countyCosts.unmatchedPairs.slice(0, 10).join(", ")}`,
    );
  }
  await applyImport(summary.updates, countyCosts.records);

  process.stdout.write(
    [
      `Imported ${SOURCE}.`,
      `${summary.matchedPlans}/${planRows.length} plans matched Section D.`,
      `${summary.variedPlans} plans have county-varying costs.`,
      `${countyCosts.records.length}/${countyCosts.enrolledPairs} enrolled plan/county values imported.`,
      "Part D drug premiums remain null because CMS does not publish them in the PBP archive.",
    ].join(" ") + "\n",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack : String(error)}\n`,
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}