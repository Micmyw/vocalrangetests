import { describe, expect, it } from "vitest";
import type { PitchDetectorAdapter, PitchEstimate } from "../dsp/types";
import { PitchFrameProcessor } from "./PitchFrameProcessor";

describe("PitchFrameProcessor", () => {
  it("combines Pitchy with signal quality before stable-note tracking", () => {
    const detector = new FixedDetector({ frequencyHz: 220, confidence: 0.4 });
    let clock = 10;
    const processor = new PitchFrameProcessor({
      pitchy: detector,
      now: () => clock += 0.25,
    });

    const result = processor.processFrame(new Float32Array(4096).fill(0.1), 48_000, 1000);

    expect(result.estimate).toEqual({ frequencyHz: 220, confidence: 0.4 });
    expect(result.signal).toMatchObject({
      state: "low-confidence",
      rejectReason: "low-confidence",
    });
    expect(result.stable).toMatchObject({ state: "collecting", frequencyHz: null });
    expect(result.processingTimeMs).toBe(0.25);
  });

  it("calibrates noise without advancing stable-note evidence", () => {
    const processor = new PitchFrameProcessor({
      pitchy: new FixedDetector({ frequencyHz: 220, confidence: 0.99 }),
    });
    processor.beginNoiseCalibration();

    const signal = processor.recordNoiseFrame(new Float32Array(4096).fill(0.002));

    expect(signal.state).toBe("calibrating");
    expect(processor.currentStable.state).toBe("idle");
    expect(processor.finishNoiseCalibration()).toBeCloseTo(0.002, 6);
  });
});

class FixedDetector implements PitchDetectorAdapter {
  readonly id = "pitchy" as const;
  readonly frameSize = 4096;

  constructor(private readonly estimate: PitchEstimate | null) {}

  detect(): PitchEstimate | null {
    return this.estimate;
  }
}
