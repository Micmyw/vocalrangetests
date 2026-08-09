import { describe, expect, it } from "vitest";
import { mapFrequencyToNote } from "../dsp/NoteMapper";
import type { ABObservation, DetectorObservation } from "../dsp/ABRunner";
import { ValidationSession } from "../validation/ValidationSession";
import type {
  AttemptResult,
  CalibrationSummary,
  DetectorAttemptResult,
  EndpointType,
  ValidationContext,
} from "../validation/types";
import {
  createSessionExport,
  formatSessionAsText,
  serializeSessionExport,
} from "./SessionExporter";

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

const calibration: CalibrationSummary = {
  durationMs: 3000,
  frameCount: 61,
  noiseFloorRms: 0.001,
  sampleRate: 48_000,
};

describe("SessionExporter", () => {
  it("exports schema v2 session, attempt, detector, and frame diagnostics without private audio fields", () => {
    const session = completedSession();
    const report = createSessionExport(session, calibration, "2026-08-09T08:10:00.000Z");
    const serialized = serializeSessionExport(report);

    expect(report.schemaVersion).toBe(2);
    expect(report.simulated).toBe(false);
    expect(report.session.context.testerId).toBe("T01");
    expect(report.session.summary.pitchy.successRate).toBe(1);
    expect(report.session.summary.endpoints.lowest.repeatableWithinOneSemitone).toBe(true);
    expect(report.session.attempts[0]).toMatchObject({
      testType: "lowest",
      testerId: "T01",
      os: "iOS 18.5",
      browser: "Safari 18.5",
      device: "iPhone",
      sampleRate: 48_000,
      frameSize: 4096,
    });
    expect(report.session.attempts[0].frames[0]).toMatchObject({
      timestampMs: 1000,
      signal: { rms: 0.1, snrDb: null, clipping: false },
      pitchy: { frequencyHz: 110, note: "A2", stableFrequencyHz: 110 },
      yin: { frequencyHz: 110.1, note: "A2", stableFrequencyHz: 110.1 },
    });
    expect(serialized).not.toMatch(/"(?:pcm|email|name|rawAudio)"/i);
    expect(serialized).not.toContain("Float32Array");
  });

  it("formats a compact aggregation-friendly text summary", () => {
    const report = createSessionExport(
      completedSession(),
      calibration,
      "2026-08-09T08:10:00.000Z",
    );
    const text = formatSessionAsText(report);

    expect(text).toContain("Real Device Validation Session");
    expect(text).toContain("Tester: T01");
    expect(text).toContain("Device: iPhone; OS: iOS 18.5; Browser: Safari 18.5");
    expect(text).toContain("Pitchy success: 6/6 (100.0%)");
    expect(text).toContain("Frame octave disagreements: 0/6 (0.0%)");
    expect(text).toContain("Lowest notes: A2, A2, A2");
    expect(text).toContain("Lowest repeatability: PASS (max 0 semitones)");
    expect(text).toContain("Highest repeatability: PASS (max 0 semitones)");
  });
});

function completedSession(): ValidationSession {
  const session = new ValidationSession(context);
  for (let index = 1; index <= 3; index += 1) session.addAttempt(attempt("lowest", index, 110));
  for (let index = 1; index <= 3; index += 1) session.addAttempt(attempt("highest", index, 440));
  return session;
}

function attempt(endpoint: EndpointType, number: number, frequencyHz: number): AttemptResult {
  const pitchyMapping = mapFrequencyToNote(frequencyHz)!;
  const yinFrequency = frequencyHz + 0.1;
  const yinMapping = mapFrequencyToNote(yinFrequency)!;
  const startedAtMs = number * 1000;
  return {
    attemptId: `${endpoint}-${number}`,
    endpoint,
    endpointAttemptNumber: number,
    tags: endpoint === "lowest" ? ["modal"] : ["head-falsetto"],
    startedAtMs,
    endedAtMs: startedAtMs + 3000,
    durationMs: 3000,
    completed: true,
    context,
    signal: {
      rmsMedian: 0.1,
      snrMedianDb: 30,
      clipping: false,
      noiseFloorRms: 0.001,
    },
    pitchy: detectorResult("pitchy", frequencyHz, pitchyMapping.midi, pitchyMapping.note),
    yin: detectorResult("yin", yinFrequency, yinMapping.midi, yinMapping.note),
    observations: [frame(startedAtMs, frequencyHz, yinFrequency)],
  };
}

function detectorResult(
  detector: "pitchy" | "yin",
  frequencyHz: number,
  midi: number,
  note: string,
): DetectorAttemptResult {
  return {
    detector,
    success: true,
    noDetection: false,
    frequencyHz,
    confidence: 0.98,
    midi,
    note,
    cents: 0,
    stableLatencyMs: 650,
    octaveAmbiguous: false,
    rejectReason: null,
    processingTimeP50Ms: detector === "pitchy" ? 0.3 : 3,
    processingTimeP95Ms: detector === "pitchy" ? 0.5 : 5,
  };
}

function frame(timestampMs: number, pitchyHz: number, yinHz: number): ABObservation {
  return {
    timestampMs,
    sampleRate: 48_000,
    frameSize: 4096,
    signal: {
      state: "usable",
      rms: 0.1,
      peak: 0.15,
      noiseFloorRms: 0.001,
      noiseFloorDb: -60,
      snrDb: Number.POSITIVE_INFINITY,
      clipping: false,
      clippedSampleRatio: 0,
      rejectReason: null,
    },
    pitchy: frameDetector(pitchyHz, 0.98, 0.3),
    yin: frameDetector(yinHz, 0.96, 3),
  };
}

function frameDetector(
  frequencyHz: number,
  confidence: number,
  processingTimeMs: number,
): DetectorObservation {
  return {
    estimate: { frequencyHz, confidence },
    note: mapFrequencyToNote(frequencyHz),
    processingTimeMs,
    stable: {
      state: "stable",
      frequencyHz,
      stableDurationMs: 650,
      rejectReason: null,
      usableRatio: 1,
      centsMad: 1,
      centsSpread: 2,
      driftCents: 1,
    },
  };
}
