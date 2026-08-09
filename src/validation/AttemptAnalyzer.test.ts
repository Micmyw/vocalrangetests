import { describe, expect, it } from "vitest";
import { mapFrequencyToNote } from "../dsp/NoteMapper";
import type { ABObservation, DetectorObservation } from "../dsp/ABRunner";
import type { SignalQuality } from "../dsp/SignalQualityEvaluator";
import type { StableState } from "../dsp/StableNoteDetector";
import { analyzeAttempt } from "./AttemptAnalyzer";
import type { ValidationContext } from "./types";

const context: ValidationContext = {
  sessionId: "session-1",
  testerId: "T01",
  createdAt: "2026-08-09T08:00:00.000Z",
  environment: {
    os: "iOS 18.5",
    browser: "Safari 18.5",
    device: "iPhone",
    userAgent: "test-agent",
  },
  sampleRate: 48_000,
  frameSize: 4096,
  cadenceHz: 20,
  trackSettings: { channelCount: 1, sampleRate: 48_000 },
  simulated: false,
};

describe("analyzeAttempt", () => {
  it("summarizes stable detector and signal observations", () => {
    const observations = [
      observation(1000, 440, "collecting", 0.2, 3, 0.10, 30),
      observation(1650, 440, "stable", 0.3, 4, 0.12, 32),
      observation(2000, 441, "stable", 0.4, 5, 0.14, 34),
      observation(3950, 439.5, "stable", 0.5, 6, 0.16, 36),
    ];

    const result = analyzeAttempt({
      observations,
      startedAtMs: 1000,
      endedAtMs: 4000,
      completed: true,
      endpoint: "highest",
      endpointAttemptNumber: 2,
      tags: ["modal", "vibrato"],
      context,
    });

    expect(result).toMatchObject({
      attemptId: "session-1-highest-2-1000",
      endpoint: "highest",
      durationMs: 3000,
      completed: true,
      tags: ["modal", "vibrato"],
      signal: {
        rmsMedian: 0.13,
        snrMedianDb: 33,
        clipping: false,
        noiseFloorRms: 0.001,
      },
    });
    expect(result.pitchy).toMatchObject({
      success: true,
      noDetection: false,
      note: "A4",
      midi: 69,
      confidence: 0.95,
      stableLatencyMs: 650,
      octaveAmbiguous: false,
      rejectReason: null,
      processingTimeP50Ms: 0.35,
      processingTimeP95Ms: 0.485,
    });
    expect(result.pitchy.frequencyHz).toBeCloseTo(440, 5);
    expect(result.yin.processingTimeP50Ms).toBe(4.5);
    expect(result.yin.processingTimeP95Ms).toBeCloseTo(5.85, 5);
  });

  it("retains failure diagnostics and rejects an incomplete capture", () => {
    const observations = [
      observation(1000, null, "rejected", 0.2, 3, 0.01, 4, "octave-ambiguous", true),
      observation(1500, null, "rejected", 0.3, 4, 0.02, 5, "no-pitch"),
      observation(2000, null, "rejected", 0.4, 5, 0.03, 6, "no-pitch"),
    ];

    const result = analyzeAttempt({
      observations,
      startedAtMs: 1000,
      endedAtMs: 2200,
      completed: false,
      endpoint: "lowest",
      endpointAttemptNumber: 1,
      tags: ["fry"],
      context,
    });

    expect(result.pitchy).toMatchObject({
      success: false,
      noDetection: true,
      frequencyHz: null,
      stableLatencyMs: null,
      octaveAmbiguous: true,
      rejectReason: "no-pitch",
    });
    expect(result.signal.clipping).toBe(true);
  });

  it("rejects a note that drifts after an early stable lock", () => {
    const observations = [
      observation(1000, 440, "collecting", 0.2, 3, 0.1, 30),
      observation(1650, 440, "stable", 0.2, 3, 0.1, 30),
      observation(2000, 440, "stable", 0.2, 3, 0.1, 30),
      observation(2200, 523.25, "rejected", 0.2, 3, 0.1, 30, "pitch-drift"),
      observation(2250, 523.25, "rejected", 0.2, 3, 0.1, 30, "pitch-drift"),
      observation(2300, 523.25, "rejected", 0.2, 3, 0.1, 30, "pitch-drift"),
      observation(2350, 523.25, "rejected", 0.2, 3, 0.1, 30, "pitch-drift"),
      observation(4000, null, "rejected", 0.2, 3, 0.001, 0, "no-pitch"),
    ];

    const result = analyzeAttempt({
      observations,
      startedAtMs: 1000,
      endedAtMs: 4000,
      completed: true,
      endpoint: "highest",
      endpointAttemptNumber: 1,
      tags: ["glide"],
      context,
    });

    expect(result.pitchy).toMatchObject({
      success: false,
      frequencyHz: null,
      note: null,
      rejectReason: "post-lock-drift",
    });
  });

  it("requires stable voiced frames near the end of the capture", () => {
    const observations = [
      observation(1000, 440, "collecting", 0.2, 3, 0.1, 30),
      observation(1650, 440, "stable", 0.2, 3, 0.1, 30),
      observation(2000, 440, "stable", 0.2, 3, 0.1, 30),
      observation(3200, null, "rejected", 0.2, 3, 0.001, 0, "no-pitch"),
      observation(3600, null, "rejected", 0.2, 3, 0.001, 0, "no-pitch"),
      observation(4000, null, "rejected", 0.2, 3, 0.001, 0, "no-pitch"),
    ];

    const result = analyzeAttempt({
      observations,
      startedAtMs: 1000,
      endedAtMs: 4000,
      completed: true,
      endpoint: "lowest",
      endpointAttemptNumber: 1,
      tags: ["modal"],
      context,
    });

    expect(result.pitchy).toMatchObject({
      success: false,
      frequencyHz: null,
      rejectReason: "insufficient-terminal-stability",
    });
  });

  it("does not count an octave-ambiguous attempt as a clean success", () => {
    const observations = [
      observation(1000, 440, "collecting", 0.2, 3, 0.1, 30),
      observation(1200, 880, "rejected", 0.2, 3, 0.1, 30, "octave-ambiguous"),
      observation(1650, 440, "stable", 0.2, 3, 0.1, 30),
      observation(2500, 440, "stable", 0.2, 3, 0.1, 30),
      observation(3200, 440, "stable", 0.2, 3, 0.1, 30),
      observation(4000, 440, "stable", 0.2, 3, 0.1, 30),
    ];

    const result = analyzeAttempt({
      observations,
      startedAtMs: 1000,
      endedAtMs: 4000,
      completed: true,
      endpoint: "highest",
      endpointAttemptNumber: 1,
      tags: ["head-falsetto"],
      context,
    });

    expect(result.pitchy).toMatchObject({
      success: false,
      octaveAmbiguous: true,
      rejectReason: "octave-ambiguous",
    });
  });
});

function observation(
  timestampMs: number,
  frequencyHz: number | null,
  stableState: StableState,
  pitchyTime: number,
  yinTime: number,
  rms: number,
  snrDb: number,
  rejectReason: string | null = null,
  clipping = false,
): ABObservation {
  const signal: SignalQuality = {
    state: clipping ? "clipped" : "usable",
    rms,
    peak: clipping ? 1 : rms * 1.4,
    noiseFloorRms: 0.001,
    noiseFloorDb: -60,
    snrDb,
    clipping,
    clippedSampleRatio: clipping ? 0.1 : 0,
    rejectReason: clipping ? "input-clipping" : null,
  };
  return {
    timestampMs,
    sampleRate: 48_000,
    frameSize: 4096,
    signal,
    pitchy: detector(frequencyHz, 0.95, stableState, timestampMs, pitchyTime, rejectReason),
    yin: detector(frequencyHz === null ? null : frequencyHz + 0.2, 0.9, stableState, timestampMs, yinTime, rejectReason),
  };
}

function detector(
  frequencyHz: number | null,
  confidence: number,
  state: StableState,
  timestampMs: number,
  processingTimeMs: number,
  rejectReason: string | null,
): DetectorObservation {
  return {
    estimate: frequencyHz === null ? null : { frequencyHz, confidence },
    note: frequencyHz === null ? null : mapFrequencyToNote(frequencyHz),
    processingTimeMs,
    stable: {
      state,
      frequencyHz: state === "stable" ? frequencyHz : null,
      stableDurationMs: state === "stable" ? timestampMs - 1000 : 0,
      rejectReason,
      usableRatio: frequencyHz === null ? 0 : 1,
      centsMad: state === "stable" ? 1 : null,
      centsSpread: state === "stable" ? 2 : null,
      driftCents: state === "stable" ? 1 : null,
    },
  };
}
