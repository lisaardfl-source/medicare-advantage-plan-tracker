import { pathToFileURL } from "node:url";
import { pool } from "@workspace/db";
import { restoreCms2026MappedBenchmarks } from "./import-cms-2026-rate-book";

async function main(): Promise<void> {
  await restoreCms2026MappedBenchmarks();
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