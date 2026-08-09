import { describe, expect, it } from "vitest";
import type { ABObservation } from "../dsp/ABRunner";
import { buildDebugSnapshot } from "./DebugView";

describe("buildDebugSnapshot", () => {
  it("formats every required diagnostic field", () => {
    const observation = {
      timestampMs: 100,
      sampleRate: 48_000,
      frameSize: 4096,
      signal: {
        state: "usable",
        rms: 0.04,
        peak: 0.1,
        noiseFloorRms: 0.001,
        noiseFloorDb: -60,
        snrDb: 32,
        clipping: false,
        clippedSampleRatio: 0,
        rejectReason: null,
      },
      pitchy: {
        estimate: { frequencyHz: 440, confidence: 0.98 },
        note: { frequencyHz: 440, midi: 69, note: "A4", cents: 0 },
        processingTimeMs: 0.3,
        stable: {
          state: "stable",
          frequencyHz: 440,
          stableDurationMs: 650,
          rejectReason: null,
          usableRatio: 1,
          centsMad: 1,
          centsSpread: 3,
          driftCents: 1,
        },
      },
      yin: {
        estimate: null,
        note: null,
        processingTimeMs: 3.2,
        stable: {
          state: "rejected",
          frequencyHz: null,
          stableDurationMs: 0,
          rejectReason: "no-pitch",
          usableRatio: 0,
          centsMad: null,
          centsSpread: null,
          driftCents: null,
        },
      },
    } satisfies ABObservation;

    const snapshot = buildDebugSnapshot(observation);

    expect(snapshot.rms).toContain("0.04000");
    expect(snapshot.noise).toContain("-60.0 dBFS");
    expect(snapshot.pitchy).toContain("440.00 Hz / A4");
    expect(snapshot.yin).toContain("no detection");
    expect(snapshot.signalState).toBe("usable");
    expect(snapshot.stableState).toContain("Pitchy stable");
    expect(snapshot.stableDuration).toContain("650 ms");
    expect(snapshot.rejectReason).toContain("YIN no-pitch");
    expect(snapshot.processingTime).toContain("0.300 ms");
  });
});
