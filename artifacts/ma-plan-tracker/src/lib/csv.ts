/**
 * Escapes a cell for a CSV download and prefixes text that spreadsheet
 * applications could evaluate as a formula.
 */
export function escapeCsvValue(
  value: string | number | null | undefined,
): string {
  let content = value == null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(content)) {
    content = `'${content}`;
  }
  return /[",\n]/.test(content)
    ? `"${content.replaceAll('"', '""')}"`
    : content;
}

export type ComparisonBenchmarkStatus = {
  fips: string;
  county_name: string;
  state_code: string;
  rate_benchmark: unknown | null | undefined;
};

export function getMissingBenchmarkCounties(
  records: ComparisonBenchmarkStatus[],
): Array<{ fips: string; label: string }> {
  return records.flatMap((record) =>
    record.rate_benchmark == null
      ? [{
          fips: record.fips,
          label: `${record.county_name}, ${record.state_code} (${record.fips})`,
        }]
      : [],
  );
}

export function getComparisonExportBlockReason(
  records: ComparisonBenchmarkStatus[],
  year: number,
): string | null {
  const missingCounties = getMissingBenchmarkCounties(records);
  if (missingCounties.length === 0) return null;

  return (
    `Cannot export the CY ${year} comparison because CMS benchmarks are missing for: ` +
    missingCounties.map((county) => county.label).join(", ")
  );
}