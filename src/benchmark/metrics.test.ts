import { describe, expect, it } from "vitest";
import { summarizeDetectorObservations } from "./metrics";

describe("summarizeDetectorObservations", () => {
  it("reports cents, octave, missing, silence false positives, and timings separately", () => {
    const report = summarizeDetectorObservations([
      { expectedFrequencyHz: 440, detectedFrequencyHz: 440, processingTimeMs: 1 },
      { expectedFrequencyHz: 440, detectedFrequencyHz: 880, processingTimeMs: 2 },
      { expectedFrequencyHz: 440, detectedFrequencyHz: null, processingTimeMs: 3 },
      { expectedFrequencyHz: null, detectedFrequencyHz: 60, processingTimeMs: 4 },
      { expectedFrequencyHz: null, detectedFrequencyHz: null, processingTimeMs: 5 },
    ]);

    expect(report.medianCentsError).toBeCloseTo(600, 8);
    expect(report.p95CentsError).toBeCloseTo(1140, 8);
    expect(report.octaveErrorRate).toBeCloseTo(1 / 3, 8);
    expect(report.noDetectionRate).toBeCloseTo(1 / 3, 8);
    expect(report.silenceFalseDetectionRate).toBe(0.5);
    expect(report.processingTimeP50Ms).toBe(3);
    expect(report.processingTimeP95Ms).toBeCloseTo(4.8, 8);
  });
});
