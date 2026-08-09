import { describe, expect, it } from "vitest";
import { runSyntheticBenchmark } from "./runSyntheticBenchmark";

describe("runSyntheticBenchmark", () => {
  it("reports both detectors for a shared configuration and sample rate", () => {
    const report = runSyntheticBenchmark({
      definitions: [{ id: "a4", kind: "sine", targetFrequencyHz: 440 }],
      configurations: [{ id: "4096-20hz", frameSize: 4096, cadenceHz: 20 }],
      sampleRates: [48_000],
      framesPerFixture: 2,
    });

    expect(report.configurations).toHaveLength(1);
    expect(report.configurations[0].pitchy.expectedPitchFrames).toBe(2);
    expect(report.configurations[0].yin.expectedPitchFrames).toBe(2);
    expect(report.configurations[0].pitchy.medianCentsError).toBeLessThan(5);
    expect(report.configurations[0].yin.medianCentsError).toBeLessThan(5);
    expect(report.configurations[0].sampleRates).toEqual([48_000]);
    expect(report.configurations[0].byKind.sine.pitchy.expectedPitchFrames).toBe(2);
    expect(report.configurations[0].byKind.sine.yin.expectedPitchFrames).toBe(2);
    expect(report.configurations[0].byFixture.a4.pitchy.expectedPitchFrames).toBe(2);
  });
});
