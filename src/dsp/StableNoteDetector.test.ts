import { describe, expect, it } from "vitest";
import type { SignalQuality } from "./SignalQualityEvaluator";
import { StableNoteDetector } from "./StableNoteDetector";

const usableQuality: SignalQuality = {
  state: "usable",
  rms: 0.05,
  peak: 0.1,
  noiseFloorRms: 0.001,
  noiseFloorDb: -60,
  snrDb: 34,
  clipping: false,
  clippedSampleRatio: 0,
  rejectReason: null,
};

function feed(
  detector: StableNoteDetector,
  frequencyAt: (timeMs: number) => number,
  durationMs = 800,
) {
  let result = detector.current;
  for (let timeMs = 0; timeMs <= durationMs; timeMs += 50) {
    result = detector.update({
      timestampMs: timeMs,
      estimate: { frequencyHz: frequencyAt(timeMs), confidence: 0.95 },
      quality: usableQuality,
    });
  }
  return result;
}

describe("StableNoteDetector", () => {
  it("accepts a sustained note after elapsed stable time", () => {
    const detector = new StableNoteDetector();
    const result = feed(detector, () => 440);

    expect(result.state).toBe("stable");
    expect(result.frequencyHz).toBeCloseTo(440, 4);
    expect(result.stableDurationMs).toBeGreaterThanOrEqual(600);
    expect(result.rejectReason).toBeNull();
  });

  it("accepts ordinary ±50 cent vibrato around one center", () => {
    const detector = new StableNoteDetector();
    const result = feed(detector, (timeMs) => {
      const cents = 50 * Math.sin((2 * Math.PI * 5 * timeMs) / 1000);
      return 440 * 2 ** (cents / 1200);
    });

    expect(result.state).toBe("stable");
    expect(result.frequencyHz).toBeCloseTo(440, 1);
  });

  it("rejects a sustained glide", () => {
    const detector = new StableNoteDetector();
    const result = feed(detector, (timeMs) => 440 * 2 ** ((200 * timeMs / 800) / 1200));

    expect(result.state).toBe("rejected");
    expect(result.rejectReason).toBe("pitch-drift");
  });

  it("rejects octave alternation rather than correcting it", () => {
    const detector = new StableNoteDetector();
    let frame = 0;
    const result = feed(detector, () => (frame++ % 2 === 0 ? 220 : 440));

    expect(result.state).toBe("rejected");
    expect(result.rejectReason).toBe("octave-ambiguous");
  });

  it("keeps unusable signal out of a stable result", () => {
    const detector = new StableNoteDetector();
    for (let timeMs = 0; timeMs <= 800; timeMs += 50) {
      detector.update({
        timestampMs: timeMs,
        estimate: { frequencyHz: 440, confidence: 0.99 },
        quality: { ...usableQuality, state: "noisy", rejectReason: "snr-below-threshold" },
      });
    }

    expect(detector.current.state).toBe("rejected");
    expect(detector.current.rejectReason).toBe("insufficient-usable-frames");
  });

  it("clears a stable state after sustained silence", () => {
    const detector = new StableNoteDetector();
    feed(detector, () => 440);

    for (let timeMs = 850; timeMs <= 1000; timeMs += 50) {
      detector.update({
        timestampMs: timeMs,
        estimate: null,
        quality: {
          ...usableQuality,
          state: "silence",
          rms: 0,
          peak: 0,
          rejectReason: "silence",
        },
      });
    }

    expect(detector.current).toMatchObject({
      state: "rejected",
      frequencyHz: null,
      rejectReason: "silence",
    });
  });
});
