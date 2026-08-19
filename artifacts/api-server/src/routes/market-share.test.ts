import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { pool } from "@workspace/db";
import { CONFIRMED_NO_2026_RATE } from "@workspace/cms-rate-reference";
import app from "../app";

type CountyMarketShareResponse = {
  benchmark_unavailable_reason: string | null;
  rate_benchmark: unknown | null;
};

let server: Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

async function getCountyMarketShare(
  fips: string,
): Promise<CountyMarketShareResponse> {
  const response = await fetch(
    `${baseUrl}/counties/${fips}/market-share?year=2026`,
  );

  assert.equal(response.status, 200);
  return (await response.json()) as CountyMarketShareResponse;
}

test(
  "explains a documented unavailable 2026 benchmark without annotating covered counties",
  async () => {
    const unavailableBenchmark = await getCountyMarketShare("02261");

    assert.equal(unavailableBenchmark.rate_benchmark, null);
    assert.equal(
      unavailableBenchmark.benchmark_unavailable_reason,
      CONFIRMED_NO_2026_RATE["02261"],
    );

    const coveredBenchmark = await getCountyMarketShare("01001");

    assert.notEqual(coveredBenchmark.rate_benchmark, null);
    assert.equal(coveredBenchmark.benchmark_unavailable_reason, null);
  },
);

test("returns a mapped 2026 benchmark for a restored crosswalk county", async () => {
  const restoredBenchmark = await getCountyMarketShare("02270");

  assert.deepEqual(restoredBenchmark.rate_benchmark, {
    year: 2026,
    cms_county_code: "02270",
    rate_5_star: 1404.81,
    rate_3_5_star: 1383.74,
    rate_0_star: 1334.57,
    esrd_rate: 9751.28,
  });
  assert.equal(restoredBenchmark.benchmark_unavailable_reason, null);
});