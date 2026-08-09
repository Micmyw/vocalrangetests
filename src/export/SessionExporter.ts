import type { DetectorObservation } from "../dsp/ABRunner";
import type { ValidationSession } from "../validation/ValidationSession";
import type {
  AttemptResult,
  CalibrationSummary,
  DetectorAttemptResult,
  EndpointSummary,
  ValidationContext,
  ValidationSessionSummary,
} from "../validation/types";

interface SignalFrameExport {
  state: string;
  rms: number;
  noiseFloorRms: number;
  snrDb: number | null;
  clipping: boolean;
}

interface DetectorFrameExport {
  frequencyHz: number | null;
  confidence: number | null;
  note: string | null;
  cents: number | null;
  stableFrequencyHz: number | null;
  stableState: string;
  stableDurationMs: number;
  octaveAmbiguous: boolean;
  rejectReason: string | null;
  processingTimeMs: number;
}

export interface SessionFrameExport {
  timestampMs: number;
  signal: SignalFrameExport;
  pitchy: DetectorFrameExport;
  yin: DetectorFrameExport;
}

export interface SessionAttemptExport {
  attemptId: string;
  sessionId: string;
  testerId: string;
  testType: "lowest" | "highest";
  endpointAttemptNumber: number;
  tags: string[];
  completed: boolean;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  os: string;
  browser: string;
  device: string;
  userAgent: string;
  sampleRate: number;
  frameSize: number;
  cadenceHz: number;
  trackSettings: ValidationContext["trackSettings"];
  signal: AttemptResult["signal"];
  pitchy: DetectorAttemptResult;
  yin: DetectorAttemptResult;
  frames: SessionFrameExport[];
}

export interface ValidationSessionExport {
  schemaVersion: 2;
  createdAt: string;
  simulated: boolean;
  session: {
    context: ValidationContext;
    calibration: CalibrationSummary;
    summary: ValidationSessionSummary;
    attempts: SessionAttemptExport[];
  };
}

export function createSessionExport(
  session: ValidationSession,
  calibration: CalibrationSummary,
  createdAt = new Date().toISOString(),
): ValidationSessionExport {
  return {
    schemaVersion: 2,
    createdAt,
    simulated: session.context.simulated,
    session: {
      context: session.context,
      calibration,
      summary: session.buildSummary(),
      attempts: session.attempts.map(exportAttempt),
    },
  };
}

export function serializeSessionExport(report: ValidationSessionExport): string {
  return `${JSON.stringify(report, (_key, value: unknown) =>
    typeof value === "number" && !Number.isFinite(value) ? null : value, 2)}\n`;
}

export function formatSessionAsText(report: ValidationSessionExport): string {
  const { context, calibration, summary } = report.session;
  return [
    "Real Device Validation Session",
    `Simulated: ${report.simulated ? "YES" : "no"}`,
    `Session: ${context.sessionId}`,
    `Tester: ${context.testerId}`,
    `Device: ${context.environment.device}; OS: ${context.environment.os}; Browser: ${context.environment.browser}`,
    `Audio: ${context.sampleRate} Hz; ${context.frameSize} samples / ${context.cadenceHz} Hz`,
    `Noise calibration: ${calibration.durationMs.toFixed(0)} ms; ${calibration.noiseFloorRms.toFixed(6)} RMS`,
    detectorSummaryText("Pitchy", summary.pitchy, summary.attemptCount),
    detectorSummaryText("YIN", summary.yin, summary.attemptCount),
    `Retries: ${summary.retryCount}`,
    `Paired octave disagreements: ${summary.octaveDisagreementCount}`,
    `Frame octave disagreements: ${summary.frameOctaveDisagreementCount}/` +
      `${summary.frameComparisonCount} (${percent(summary.frameOctaveDisagreementRate)})`,
    ...endpointText("Lowest", summary.endpoints.lowest),
    ...endpointText("Highest", summary.endpoints.highest),
  ].join("\n");
}

function exportAttempt(attempt: AttemptResult): SessionAttemptExport {
  const { environment } = attempt.context;
  return {
    attemptId: attempt.attemptId,
    sessionId: attempt.context.sessionId,
    testerId: attempt.context.testerId,
    testType: attempt.endpoint,
    endpointAttemptNumber: attempt.endpointAttemptNumber,
    tags: [...attempt.tags],
    completed: attempt.completed,
    startedAtMs: attempt.startedAtMs,
    endedAtMs: attempt.endedAtMs,
    durationMs: attempt.durationMs,
    os: environment.os,
    browser: environment.browser,
    device: environment.device,
    userAgent: environment.userAgent,
    sampleRate: attempt.context.sampleRate,
    frameSize: attempt.context.frameSize,
    cadenceHz: attempt.context.cadenceHz,
    trackSettings: attempt.context.trackSettings,
    signal: attempt.signal,
    pitchy: attempt.pitchy,
    yin: attempt.yin,
    frames: attempt.observations.map((observation) => ({
      timestampMs: observation.timestampMs,
      signal: {
        state: observation.signal.state,
        rms: observation.signal.rms,
        noiseFloorRms: observation.signal.noiseFloorRms,
        snrDb: finiteOrNull(observation.signal.snrDb),
        clipping: observation.signal.clipping,
      },
      pitchy: exportDetectorFrame(observation.pitchy),
      yin: exportDetectorFrame(observation.yin),
    })),
  };
}

function exportDetectorFrame(observation: DetectorObservation): DetectorFrameExport {
  return {
    frequencyHz: observation.estimate?.frequencyHz ?? null,
    confidence: observation.estimate?.confidence ?? null,
    note: observation.note?.note ?? null,
    cents: observation.note?.cents ?? null,
    stableFrequencyHz: observation.stable.frequencyHz,
    stableState: observation.stable.state,
    stableDurationMs: observation.stable.stableDurationMs,
    octaveAmbiguous: observation.stable.rejectReason === "octave-ambiguous",
    rejectReason: observation.stable.rejectReason,
    processingTimeMs: observation.processingTimeMs,
  };
}

function detectorSummaryText(
  label: string,
  detector: ValidationSessionSummary["pitchy"],
  total: number,
): string {
  return `${label} success: ${detector.successCount}/${total} (${percent(detector.successRate)}); ` +
    `no detection ${detector.noDetectionCount}/${total} (${percent(detector.noDetectionRate)}); ` +
    `ambiguity ${detector.octaveAmbiguityCount}; p50/p95 ` +
    `${detector.processingTimeP50Ms.toFixed(3)}/${detector.processingTimeP95Ms.toFixed(3)} ms`;
}

function endpointText(label: string, endpoint: EndpointSummary): string[] {
  const spread = endpoint.maximumSemitoneDifference;
  const repeatability = endpoint.repeatableWithinOneSemitone === null
    ? "INCOMPLETE"
    : endpoint.repeatableWithinOneSemitone ? "PASS" : "FAIL";
  return [
    `${label} notes: ${endpoint.notes.length > 0 ? endpoint.notes.join(", ") : "none"}`,
    `${label} repeatability: ${repeatability} ` +
      `(max ${spread === null ? "n/a" : spread} semitones)`,
    `${label} attempts: ${endpoint.attemptCount}; Pitchy/YIN success ` +
      `${percent(endpoint.pitchySuccessRate)}/${percent(endpoint.yinSuccessRate)}`,
  ];
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}
