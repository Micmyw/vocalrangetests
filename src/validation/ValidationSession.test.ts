import { describe, expect, it } from "vitest";
import { ValidationSession } from "./ValidationSession";
import type {
  AttemptResult,
  DetectorAttemptResult,
  EndpointType,
  ValidationContext,
} from "./types";

const context: ValidationContext = {
  sessionId: "session-1",
  testerId: "T01",
  createdAt: "2026-08-09T08:00:00.000Z",
  environment: {
    os: "Windows",
    browser: "Chrome 138",
    device: "Desktop",
    userAgent: "agent",
  },
  sampleRate: 48_000,
  frameSize: 4096,
  cadenceHz: 20,
  trackSettings: null,
  simulated: false,
};

describe("ValidationSession", () => {
  it("retains failed retries and advances after three Pitchy successes", () => {
    const session = new ValidationSession(context);
    session.addAttempt(attempt("lowest", 1, null));

    expect(session.currentEndpoint).toBe("lowest");
    expect(session.retryCount).toBe(1);
    expect(session.successfulCount("lowest")).toBe(0);

    session.addAttempt(attempt("lowest", 2, 110));
    session.addAttempt(attempt("lowest", 3, 111));
    session.addAttempt(attempt("lowest", 4, 116.54));

    expect(session.currentEndpoint).toBe("highest");
    expect(session.successfulCount("lowest")).toBe(3);
    expect(session.isComplete).toBe(false);

    session.addAttempt(attempt("highest", 1, 440));
    session.addAttempt(attempt("highest", 2, 466.16));
    session.addAttempt(attempt("highest", 3, 493.88));

    expect(session.isComplete).toBe(true);
    expect(session.attempts).toHaveLength(7);
  });

  it("calculates endpoint repeatability and detector session metrics", () => {
    const session = new ValidationSession(context);
    session.addAttempt(attempt("lowest", 1, null));
    session.addAttempt(attempt("lowest", 2, 110));
    session.addAttempt(attempt("lowest", 3, 111, { yinSuccess: false }));
    session.addAttempt(attempt("lowest", 4, 116.54));
    session.addAttempt(attempt("highest", 1, 440, { yinMidi: 57, yinHz: 220 }));
    session.addAttempt(attempt("highest", 2, 466.16));
    session.addAttempt(attempt("highest", 3, 493.88));

    const summary = session.buildSummary();

    expect(summary.retryCount).toBe(1);
    expect(summary.attemptCount).toBe(7);
    expect(summary.pitchy).toMatchObject({
      successCount: 6,
      successRate: 6 / 7,
      noDetectionCount: 1,
      noDetectionRate: 1 / 7,
    });
    expect(summary.yin.successCount).toBe(5);
    expect(summary.octaveDisagreementCount).toBe(1);
    expect(summary.endpoints.lowest).toMatchObject({
      completed: true,
      notes: ["A2", "A2", "A♯2"],
      maximumSemitoneDifference: 1,
      repeatableWithinOneSemitone: true,
    });
    expect(summary.endpoints.highest).toMatchObject({
      notes: ["A4", "A♯4", "B4"],
      maximumSemitoneDifference: 2,
      repeatableWithinOneSemitone: false,
    });
  });

  it("reports an incomplete endpoint and does not count cancellation as a retry", () => {
    const session = new ValidationSession(context);
    session.addAttempt(attempt("lowest", 1, 110));
    session.addAttempt(attempt("lowest", 2, null, { completed: false }));

    const lowest = session.buildSummary().endpoints.lowest;
    expect(lowest.completed).toBe(false);
    expect(lowest.notes).toEqual(["A2"]);
    expect(lowest.maximumSemitoneDifference).toBeNull();
    expect(lowest.repeatableWithinOneSemitone).toBeNull();
    expect(session.retryCount).toBe(0);
  });

  it("reports high-quality frame-level octave disagreements separately from final results", () => {
    const session = new ValidationSession(context);
    const capture = attempt("lowest", 1, 220);
    capture.observations = [pairedObservation(1000, 220, 440)];
    session.addAttempt(capture);

    expect(session.buildSummary()).toMatchObject({
      octaveDisagreementCount: 0,
      frameComparisonCount: 1,
      frameOctaveDisagreementCount: 1,
      frameOctaveDisagreementRate: 1,
    });
  });

  it("rejects attempts for the wrong endpoint or session", () => {
    const session = new ValidationSession(context);
    expect(() => session.addAttempt(attempt("highest", 1, 440))).toThrow(
      "Expected a lowest attempt",
    );
    const otherSessionAttempt = attempt("lowest", 1, 110);
    otherSessionAttempt.context = { ...context, sessionId: "other" };
    expect(() => session.addAttempt(otherSessionAttempt)).toThrow("session does not match");
  });
});

function attempt(
  endpoint: EndpointType,
  endpointAttemptNumber: number,
  pitchyHz: number | null,
  options: {
    completed?: boolean;
    yinSuccess?: boolean;
    yinMidi?: number;
    yinHz?: number;
  } = {},
): AttemptResult {
  const completed = options.completed ?? true;
  const pitchy = detector("pitchy", pitchyHz, completed && pitchyHz !== null);
  const yinHz = options.yinHz ?? pitchyHz;
  const yin = detector(
    "yin",
    yinHz,
    completed && yinHz !== null && (options.yinSuccess ?? true),
    options.yinMidi,
  );
  return {
    attemptId: `attempt-${endpoint}-${endpointAttemptNumber}`,
    endpoint,
    endpointAttemptNumber,
    tags: ["modal"],
    startedAtMs: endpointAttemptNumber * 4000,
    endedAtMs: endpointAttemptNumber * 4000 + (completed ? 3000 : 1000),
    durationMs: completed ? 3000 : 1000,
    completed,
    context,
    signal: {
      rmsMedian: 0.1,
      snrMedianDb: 30,
      clipping: false,
      noiseFloorRms: 0.001,
    },
    pitchy,
    yin,
    observations: [],
  };
}

function pairedObservation(
  timestampMs: number,
  pitchyHz: number,
  yinHz: number,
): AttemptResult["observations"][number] {
  const detectorObservation = (frequencyHz: number, processingTimeMs: number) => ({
    estimate: { frequencyHz, confidence: 0.95 },
    note: null,
    processingTimeMs,
    stable: {
      state: "stable" as const,
      frequencyHz,
      stableDurationMs: 650,
      rejectReason: null,
      usableRatio: 1,
      centsMad: 1,
      centsSpread: 2,
      driftCents: 1,
    },
  });
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
      snrDb: 30,
      clipping: false,
      clippedSampleRatio: 0,
      rejectReason: null,
    },
    pitchy: detectorObservation(pitchyHz, 0.3),
    yin: detectorObservation(yinHz, 3),
  };
}

function detector(
  detectorId: "pitchy" | "yin",
  frequencyHz: number | null,
  success: boolean,
  midiOverride?: number,
): DetectorAttemptResult {
  const midi = midiOverride ?? (frequencyHz === null
    ? null
    : Math.round(69 + 12 * Math.log2(frequencyHz / 440)));
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const note = midi === null ? null : `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  return {
    detector: detectorId,
    success,
    noDetection: frequencyHz === null,
    frequencyHz,
    confidence: frequencyHz === null ? null : 0.95,
    midi,
    note,
    cents: frequencyHz === null ? null : 0,
    stableLatencyMs: success ? 650 : null,
    octaveAmbiguous: false,
    rejectReason: success ? null : "no-pitch",
    processingTimeP50Ms: detectorId === "pitchy" ? 0.3 : 3,
    processingTimeP95Ms: detectorId === "pitchy" ? 0.5 : 5,
  };
}
