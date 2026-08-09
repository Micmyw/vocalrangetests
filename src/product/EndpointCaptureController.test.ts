import { describe, expect, it } from "vitest";
import type { PitchFrameObservation } from "./PitchFrameProcessor";
import { EndpointCaptureController } from "./EndpointCaptureController";

describe("EndpointCaptureController", () => {
  it("does not accept a single stable frame", () => {
    const capture = new EndpointCaptureController({ startedAtMs: 0 });

    expect(capture.update(observation(600, "stable", 220))).toMatchObject({
      state: "collecting",
    });
  });

  it("accepts a stable note only after terminal confirmation", () => {
    const capture = new EndpointCaptureController({ startedAtMs: 0 });
    let status = capture.update(observation(550, "collecting", 220));
    for (let timestampMs = 600; timestampMs <= 1_400; timestampMs += 50) {
      status = capture.update(observation(timestampMs, "stable", timestampMs % 100 ? 220.1 : 220));
    }

    expect(status).toMatchObject({
      state: "success",
      endpoint: { midi: 57, note: "A3" },
      stableLatencyMs: 600,
    });
    if (status.state !== "success") throw new Error("Expected successful capture");
    expect(status.endpoint.frequencyHz).toBeCloseTo(220.05, 1);
  });

  it("rejects signal loss after lock as insufficient terminal stability", () => {
    const capture = new EndpointCaptureController({ startedAtMs: 0 });
    capture.update(observation(600, "stable", 220));

    expect(capture.update(observation(
      800,
      "rejected",
      null,
      "silence",
      "silence",
    ))).toEqual({
      state: "rejected",
      reason: "insufficient-terminal-stability",
    });
  });

  it("rejects post-lock drift", () => {
    const capture = new EndpointCaptureController({ startedAtMs: 0 });
    capture.update(observation(600, "stable", 220));

    expect(capture.update(observation(
      850,
      "rejected",
      246.94,
      "pitch-drift",
    ))).toEqual({ state: "rejected", reason: "post-lock-drift" });
  });

  it("never promotes an octave-ambiguous attempt to success", () => {
    const capture = new EndpointCaptureController({ startedAtMs: 0 });
    capture.update(observation(500, "rejected", 440, "octave-ambiguous"));
    let status = capture.update(observation(600, "stable", 220));
    for (let timestampMs = 650; timestampMs <= 1_400; timestampMs += 50) {
      status = capture.update(observation(timestampMs, "stable", 220));
    }

    expect(status).toEqual({ state: "rejected", reason: "octave-ambiguous" });
  });

  it("times out with a finite, useful rejection", () => {
    const capture = new EndpointCaptureController({
      startedAtMs: 0,
      attemptTimeoutMs: 1_000,
    });
    capture.update(observation(0, "collecting", null, "no-pitch", "no-pitch"));

    expect(capture.update(observation(
      1_000,
      "rejected",
      null,
      "low-confidence",
      "low-confidence",
    ))).toEqual({ state: "rejected", reason: "low-confidence" });
  });
});

function observation(
  timestampMs: number,
  stableState: PitchFrameObservation["stable"]["state"],
  frequencyHz: number | null,
  stableRejectReason: string | null = null,
  signalRejectReason: string | null = null,
): PitchFrameObservation {
  const estimate = frequencyHz === null
    ? null
    : { frequencyHz, confidence: 0.98 };
  return {
    timestampMs,
    sampleRate: 48_000,
    estimate,
    note: null,
    signal: {
      state: signalRejectReason === null ? "usable" : signalRejectReason === "silence" ? "silence" : "low-confidence",
      rms: estimate ? 0.1 : 0,
      peak: estimate ? 0.14 : 0,
      noiseFloorRms: 0.001,
      noiseFloorDb: -60,
      snrDb: estimate ? 40 : Number.NEGATIVE_INFINITY,
      clipping: false,
      clippedSampleRatio: 0,
      rejectReason: signalRejectReason,
    },
    stable: {
      state: stableState,
      frequencyHz: stableState === "stable" ? frequencyHz : null,
      stableDurationMs: stableState === "stable" ? Math.max(0, timestampMs - 600) : 0,
      rejectReason: stableRejectReason,
      usableRatio: stableState === "stable" ? 1 : 0,
      centsMad: stableState === "stable" ? 1 : null,
      centsSpread: stableState === "stable" ? 2 : null,
      driftCents: stableState === "stable" ? 1 : null,
    },
    processingTimeMs: 1,
  };
}

