import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runSyntheticBenchmark } from "../src/benchmark/runSyntheticBenchmark";

const report = runSyntheticBenchmark();
const outputDirectory = resolve("benchmark-results");
const outputPath = resolve(outputDirectory, "synthetic-report.json");
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.table(report.configurations.flatMap((configuration) =>
  (["pitchy", "yin"] as const).map((detector) => {
    const metrics = configuration[detector];
    return {
      configuration: configuration.id,
      detector,
      "median cents": metrics.medianCentsError?.toFixed(2) ?? "n/a",
      "P95 cents": metrics.p95CentsError?.toFixed(2) ?? "n/a",
      "octave error %": (metrics.octaveErrorRate * 100).toFixed(2),
      "no detection %": (metrics.noDetectionRate * 100).toFixed(2),
      "silence false %": (metrics.silenceFalseDetectionRate * 100).toFixed(2),
      "time p50 ms": metrics.processingTimeP50Ms.toFixed(3),
      "time p95 ms": metrics.processingTimeP95Ms.toFixed(3),
    };
  }),
));
console.log(`Synthetic benchmark JSON: ${outputPath}`);
