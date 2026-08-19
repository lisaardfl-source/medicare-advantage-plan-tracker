import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeCsvValue,
  getComparisonExportBlockReason,
  getMissingBenchmarkCounties,
} from "./csv";

test("CSV exports neutralize formula-leading text", () => {
  for (const value of ["=SUM(A1:A2)", "+HYPERLINK()", "-1+1", "@A1"]) {
    assert.equal(escapeCsvValue(value), `'${value}`);
  }
});

test("CSV exports retain valid escaping for quotes and commas", () => {
  assert.equal(escapeCsvValue('North, "Example"'), '"North, ""Example"""');
  assert.equal(escapeCsvValue(null), "");
  assert.equal(escapeCsvValue(1207.64), "1207.64");
});

test("missing county benchmarks identify the records that must block export", () => {
  const records = [
    {
      fips: "01001",
      county_name: "Autauga",
      state_code: "AL",
      rate_benchmark: { year: 2026 },
    },
    {
      fips: "24033",
      county_name: "Prince George",
      state_code: "MD",
      rate_benchmark: null,
    },
    {
      fips: "51510",
      county_name: "Alexandria",
      state_code: "VA",
      rate_benchmark: undefined,
    },
  ];

  assert.deepEqual(
    getMissingBenchmarkCounties(records),
    [
      { fips: "24033", label: "Prince George, MD (24033)" },
      { fips: "51510", label: "Alexandria, VA (51510)" },
    ],
  );
  assert.equal(
    getComparisonExportBlockReason(records, 2026),
    "Cannot export the CY 2026 comparison because CMS benchmarks are missing for: Prince George, MD (24033), Alexandria, VA (51510)",
  );
  assert.equal(
    getComparisonExportBlockReason([records[0]], 2026),
    null,
  );
});