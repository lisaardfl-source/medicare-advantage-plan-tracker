import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCountyRateRecords,
  countyMatchKey,
  normalizeCountyName,
  parseRateBook,
  replaceVerifiedCms2026CountyRates,
  RESTORED_2026_MAPPED_BENCHMARK_FIPS,
  type CountyRateRecord,
  type CountyRateReplacementRunner,
  type CmsCountyRate,
  type TrackedCounty,
} from "./import-cms-2026-rate-book";
import { CONFIRMED_NO_2026_RATE } from "@workspace/cms-rate-reference";
import { EXPECTED_2026_RATE_BENCHMARK_COUNT } from "./verify-cms-2026-rate-book-coverage";

const trackedCounties: TrackedCounty[] = [
  { fips: "01001", countyName: "Autauga County", stateName: "Alabama" },
  { fips: "01115", countyName: "Saint Clair County", stateName: "Alabama" },
  { fips: "06037", countyName: "Los Angeles County", stateName: "California" },
  { fips: "24033", countyName: "Prince George County", stateName: "Maryland" },
  { fips: "51510", countyName: "Alexandria City", stateName: "Virginia" },
];

const rateBook = [
  "Medicare Advantage Monthly Capitation Rates for 2026",
  "Code,State,County Name,Parts A&B 5% Bonus 2026 Rate,Parts A&B 3.5% Bonus 2026 Rate,Parts A&B 0% Bonus 2026 Rate,Parts A&B ESRD 2026 Rate",
  '01000,ALABAMA,AUTAUGA,"1,369.86","1,336.99","1,260.27","8,984.56"',
  '01150,ALABAMA,ST. CLAIR,"1,319.98","1,286.28","1,207.64","8,984.56"',
  '05200,CALIFORNIA,LOS ANGELES,"1,479.86","1,457.66","1,405.87","11,367.32"',
  '05210,CALIFORNIA,LOS ANGELES,"1,479.86","1,457.66","1,405.87","11,367.32"',
  `21160,MARYLAND,PRINCE GEORGE'S,"1,350.32","1,330.07","1,282.80","11,163.92"`,
  '49011,VIRGINIA,ALEXANDRIA CITY,"1,268.43","1,250.93","1,210.11","9,091.11"',
].join("\n");

test("normalizes CMS county names and known source exceptions", () => {
  assert.equal(normalizeCountyName("Saint Clair County"), "STCLAIR");
  assert.equal(normalizeCountyName("St. Mary's Parish"), "STMARYS");
  assert.equal(normalizeCountyName("Alexandria City"), "ALEXANDRIACITY");
  assert.equal(
    countyMatchKey("Maryland", "Prince George County"),
    countyMatchKey("MARYLAND", "Prince George's"),
  );
});

test("builds exactly one 2026 benchmark for every tracked county", () => {
  const { records, confirmedGaps } = buildCountyRateRecords(
    trackedCounties,
    parseRateBook(rateBook),
  );

  assert.equal(confirmedGaps.length, 0);
  assert.equal(records.length, trackedCounties.length);
  assert.equal(
    new Set(records.map((record) => record.county_fips)).size,
    trackedCounties.length,
  );
  assert.deepEqual(
    Object.fromEntries(
      records.map((record) => [
        record.county_fips,
        {
          cmsCountyCode: record.cms_county_code,
          rate0Star: record.rate_0_star,
          esrdRate: record.esrd_rate,
        },
      ]),
    ),
    {
      "01001": {
        cmsCountyCode: "01000",
        rate0Star: "1260.27",
        esrdRate: "8984.56",
      },
      "01115": {
        cmsCountyCode: "01150",
        rate0Star: "1207.64",
        esrdRate: "8984.56",
      },
      "06037": {
        cmsCountyCode: "05200",
        rate0Star: "1405.87",
        esrdRate: "11367.32",
      },
      "24033": {
        cmsCountyCode: "21160",
        rate0Star: "1282.8",
        esrdRate: "11163.92",
      },
      "51510": {
        cmsCountyCode: "49011",
        rate0Star: "1210.11",
        esrdRate: "9091.11",
      },
    },
  );
});

test("refuses missing and conflicting benchmark mappings", () => {
  assert.throws(
    () =>
      buildCountyRateRecords(
        [
          ...trackedCounties,
          {
            fips: "99999",
            countyName: "Missing County",
            stateName: "Alabama",
          },
        ],
        parseRateBook(rateBook),
      ),
    /No direct CMS 2026 rate-book match/,
  );

  const conflictingRates: CmsCountyRate[] = [
    {
      code: "99999",
      stateName: "ALABAMA",
      countyName: "AUTAUGA",
      rate5Star: 999,
      rate3_5Star: 999,
      rate0Star: 999,
      esrdRate: 999,
    },
    ...parseRateBook(rateBook),
  ];
  assert.throws(
    () => buildCountyRateRecords(trackedCounties, conflictingRates),
    /conflicting CMS 2026 rates/,
  );
});

const crosswalkRateBook = [
  "Medicare Advantage Monthly Capitation Rates for 2026",
  "Code,State,County Name,Parts A&B 5% Bonus 2026 Rate,Parts A&B 3.5% Bonus 2026 Rate,Parts A&B 0% Bonus 2026 Rate,Parts A&B ESRD 2026 Rate",
  '02270,ALASKA,WADE HAMPTON (KUSILVAK),"1,404.81","1,383.74","1,334.57","9,751.28"',
  '19290,LOUISIANA,LA SALLE (LASALLE),"1,460.83","1,438.92","1,387.79","9,149.39"',
  '43560,SOUTH DAKOTA,SHANNON (OGLALA LAKOTA),"1,444.12","1,422.46","1,371.91","9,300.04"',
  '48010,VIRGIN ISLANDS,ST. CROIX,906.45,906.45,906.45,"9,014.77"',
  '48020,VIRGIN ISLANDS,ST. JOHN,"1,012.87","1,000.21",970.67,"9,014.77"',
  '64XXX,AMERICAN SAMOA,AMERICAN SAMOA,671.58,671.58,671.58,"6,471.70"',
  '63050,NORTHERN MARIANA ISLANDS,NORTHERN MARIANA ISLAND,939.34,939.34,939.34,"6,885.61"',
  '65010,GU,AGANA,"1,021.14","1,021.14","1,021.14","9,622.19"',
  '65020,GU,AGANA HEIGHTS,"1,021.14","1,021.14","1,021.14","9,622.19"',
].join("\n");

const crosswalkCounties: TrackedCounty[] = [
  { fips: "02270", countyName: "Wade Hampton", stateName: "Alaska" },
  { fips: "22059", countyName: "La Salle", stateName: "Louisiana" },
  { fips: "46113", countyName: "Shannon", stateName: "South Dakota" },
  { fips: "78010", countyName: "St. Croix", stateName: "U.S. Virgin Islands" },
  { fips: "78020", countyName: "St. John", stateName: "U.S. Virgin Islands" },
  {
    fips: "60010",
    countyName: "Eastern District",
    stateName: "American Samoa",
  },
  { fips: "60020", countyName: "Manu'a District", stateName: "American Samoa" },
  { fips: "60040", countyName: "Swains Island", stateName: "American Samoa" },
  {
    fips: "60050",
    countyName: "Western District",
    stateName: "American Samoa",
  },
  { fips: "60030", countyName: "Rose Island", stateName: "American Samoa" },
  {
    fips: "69085",
    countyName: "Northern Islands Municipality",
    stateName: "Northern Mariana Islands",
  },
  { fips: "66010", countyName: "Guam", stateName: "Guam" },
];

test("maps legacy names and territories through the published crosswalk", () => {
  const { records, confirmedGaps } = buildCountyRateRecords(
    crosswalkCounties,
    parseRateBook(crosswalkRateBook),
  );

  assert.equal(confirmedGaps.length, 0);
  assert.deepEqual(
    Object.fromEntries(
      records.map((record) => [record.county_fips, record.cms_county_code]),
    ),
    {
      "02270": "02270",
      "22059": "19290",
      "46113": "43560",
      "78010": "48010",
      "78020": "48020",
      "60010": "64XXX",
      "60020": "64XXX",
      "60040": "64XXX",
      "60050": "64XXX",
      "60030": "64XXX",
      "69085": "63050",
      "66010": "65010",
    },
  );
});

test("builds all 11 mapped benchmark rows targeted by the recovery command", () => {
  const { records } = buildCountyRateRecords(
    crosswalkCounties,
    parseRateBook(crosswalkRateBook),
  );

  assert.deepEqual(
    records
      .map((record) => record.county_fips)
      .filter((fips) =>
        (RESTORED_2026_MAPPED_BENCHMARK_FIPS as readonly string[]).includes(
          fips,
        ),
      )
      .sort(),
    [...RESTORED_2026_MAPPED_BENCHMARK_FIPS].sort(),
  );
});

test("fails when a territory's collapsed rows stop being uniform", () => {
  const divergedGuam = crosswalkRateBook.replace(
    '65020,GU,AGANA HEIGHTS,"1,021.14","1,021.14","1,021.14","9,622.19"',
    '65020,GU,AGANA HEIGHTS,"1,099.99","1,021.14","1,021.14","9,622.19"',
  );
  assert.throws(
    () =>
      buildCountyRateRecords(crosswalkCounties, parseRateBook(divergedGuam)),
    /conflicting CMS 2026 rates/,
  );
});

test("keeps confirmed non-coverage geographies null without failing", () => {
  const { records, confirmedGaps } = buildCountyRateRecords(
    [
      ...trackedCounties,
      { fips: "51515", countyName: "Bedford City", stateName: "Virginia" },
      { fips: "02261", countyName: "Valdez-Cordova", stateName: "Alaska" },
      {
        fips: "78030",
        countyName: "St. Thomas",
        stateName: "U.S. Virgin Islands",
      },
    ],
    parseRateBook(rateBook),
  );

  assert.equal(records.length, trackedCounties.length);
  assert.equal(confirmedGaps.length, 3);
  assert.match(confirmedGaps[0], /51515 \(Bedford City, Virginia\)/);
  assert.match(confirmedGaps[1], /02261 \(Valdez-Cordova, Alaska\)/);
  assert.match(
    confirmedGaps[2],
    /78030 \(St\. Thomas, U\.S\. Virgin Islands\)/,
  );
  assert.ok(
    !records.some(
      (record) =>
        record.county_fips === "51515" || record.county_fips === "02261",
    ),
  );
});

test("fails when a confirmed-gap geography gains a direct rate-book match", () => {
  const bookWithBedfordCity = [
    rateBook,
    '49091,VIRGINIA,BEDFORD CITY,"1,242.91","1,242.91","1,242.91","9,091.11"',
  ].join("\n");
  assert.throws(
    () =>
      buildCountyRateRecords(
        [
          ...trackedCounties,
          { fips: "51515", countyName: "Bedford City", stateName: "Virginia" },
        ],
        parseRateBook(bookWithBedfordCity),
      ),
    /re-review CONFIRMED_NO_2026_RATE/,
  );
});

function expectedBenchmarkRecords(cmsCountyCode: string): CountyRateRecord[] {
  return Array.from(
    { length: EXPECTED_2026_RATE_BENCHMARK_COUNT },
    (_, index) => ({
      county_fips: `BENCHMARK-${String(index).padStart(4, "0")}`,
      year: 2026,
      cms_county_code: cmsCountyCode,
      rate_5_star: "1000",
      rate_3_5_star: "1000",
      rate_0_star: "1000",
      esrd_rate: "1000",
    }),
  );
}

function atomicMemoryRateStore(initialRecords: CountyRateRecord[]): {
  runTransaction: CountyRateReplacementRunner;
  records: () => CountyRateRecord[];
} {
  const countyFips = [
    ...Object.keys(CONFIRMED_NO_2026_RATE).filter((fips) => fips !== "78030"),
    ...expectedBenchmarkRecords("benchmark").map(
      (record) => record.county_fips,
    ),
  ];
  let committedRecords = initialRecords;

  return {
    runTransaction: async (operation) => {
      let stagedRecords = committedRecords;
      await operation({
        replaceYear: async (records) => {
          stagedRecords = records;
        },
        loadCoverage: async () => ({
          countyFips,
          rateFips: stagedRecords.map((record) => record.county_fips),
        }),
      });
      committedRecords = stagedRecords;
    },
    records: () => committedRecords,
  };
}

test("keeps the prior verified benchmark set when a staged replacement fails coverage", async () => {
  const previousRecords = expectedBenchmarkRecords("previous");
  const store = atomicMemoryRateStore(previousRecords);
  const incompleteRecords = expectedBenchmarkRecords("failed").slice(0, -1);

  await assert.rejects(
    () =>
      replaceVerifiedCms2026CountyRates(
        incompleteRecords,
        store.runTransaction,
      ),
    /Expected 3,222 CY2026 county benchmarks but found 3,221/,
  );

  assert.equal(store.records().length, previousRecords.length);
  assert.equal(store.records()[0]?.cms_county_code, "previous");
});

test("commits a complete benchmark replacement only after coverage succeeds", async () => {
  const store = atomicMemoryRateStore(expectedBenchmarkRecords("previous"));
  const replacementRecords = expectedBenchmarkRecords("replacement");

  await replaceVerifiedCms2026CountyRates(
    replacementRecords,
    store.runTransaction,
  );

  assert.equal(store.records().length, replacementRecords.length);
  assert.equal(store.records()[0]?.cms_county_code, "replacement");
});
