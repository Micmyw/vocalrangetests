import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serializeSessionExport } from "../src/export/SessionExporter";
import { runValidationSimulation } from "../src/simulation/runValidationSimulation";

const report = runValidationSimulation();
const outputDirectory = resolve("validation-results");
const outputPath = resolve(outputDirectory, "simulated-session.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, serializeSessionExport(report), "utf8");

const summary = report.session.summary;
console.table([
  {
    source: "SIMULATED - NOT REAL-PERSON EVIDENCE",
    attempts: summary.attemptCount,
    retries: summary.retryCount,
    "Pitchy success %": (summary.pitchy.successRate * 100).toFixed(1),
    "YIN success %": (summary.yin.successRate * 100).toFixed(1),
    "Lowest repeatable": summary.endpoints.lowest.repeatableWithinOneSemitone,
    "Highest repeatable": summary.endpoints.highest.repeatableWithinOneSemitone,
  },
]);
console.log(`Simulated validation JSON: ${outputPath}`);
