import { describe, expect, it } from "vitest";
import type { ABObservation } from "../dsp/ABRunner";
import { createCaptureExport, formatCaptureAsText, serializeCapture } from "./CaptureExporter";

const observation: ABObservation = {
  timestampMs: 1000,
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
    estimate: { frequencyHz: 441, confidence: 0.95 },
    note: { frequencyHz: 441, midi: 69, note: "A4", cents: 3.93 },
    processingTimeMs: 3.2,
    stable: {
      state: "collecting",
      frequencyHz: null,
      stableDurationMs: 400,
      rejectReason: null,
      usableRatio: 1,
      centsMad: null,
      centsSpread: null,
      driftCents: null,
    },
  },
};

describe("CaptureExporter", () => {
  it("exports aggregate and frame diagnostics without PCM", () => {
    const report = createCaptureExport([observation], {
      startedAt: "2026-08-09T00:00:00.000Z",
      userAgent: "test-browser",
      configurationId: "4096-20hz",
      trackSettings: { channelCount: 1, sampleRate: 48_000 },
    });
    const json = serializeCapture(report);

    expect(report.summary.frameCount).toBe(1);
    expect(report.summary.pitchy.detectedFrames).toBe(1);
    expect(report.summary.pitchy.processingTimeP50Ms).toBe(0.3);
    expect(report.frames[0].pitchy.note).toBe("A4");
    expect(json).not.toMatch(/pcm|samples/i);
  });

  it("formats a compact text report for clipboard sharing", () => {
    const report = createCaptureExport([observation], {
      startedAt: "2026-08-09T00:00:00.000Z",
      userAgent: "test-browser",
      configurationId: "4096-20hz",
      trackSettings: null,
    });

    expect(formatCaptureAsText(report)).toContain("4096-20hz");
    expect(formatCaptureAsText(report)).toContain("Pitchy: detected 1/1");
    expect(formatCaptureAsText(report)).toContain("YIN: detected 1/1");
  });
});
