import type { ABObservation, DetectorObservation } from "../dsp/ABRunner";
import { percentile } from "../benchmark/metrics";

export interface CaptureMetadata {
  startedAt: string;
  userAgent: string;
  configurationId: string;
  trackSettings: MediaTrackSettings | null;
}

export interface CaptureDetectorSummary {
  detectedFrames: number;
  detectionRate: number;
  stableFrames: number;
  medianFrequencyHz: number | null;
  medianConfidence: number | null;
  processingTimeP50Ms: number;
  processingTimeP95Ms: number;
  notes: Record<string, number>;
  rejectReasons: Record<string, number>;
}

export interface CaptureFrameExport {
  timestampMs: number;
  signal: {
    state: string;
    rms: number;
    noiseFloorRms: number;
    snrDb: number | null;
    clipping: boolean;
  };
  pitchy: DetectorFrameExport;
  yin: DetectorFrameExport;
}

interface DetectorFrameExport {
  frequencyHz: number | null;
  confidence: number | null;
  note: string | null;
  cents: number | null;
  stableState: string;
  stableDurationMs: number;
  rejectReason: string | null;
  processingTimeMs: number;
}

export interface CaptureExport {
  schemaVersion: 1;
  createdAt: string;
  metadata: CaptureMetadata;
  summary: {
    frameCount: number;
    durationMs: number;
    sampleRate: number | null;
    frameSize: number | null;
    signalStates: Record<string, number>;
    pitchy: CaptureDetectorSummary;
    yin: CaptureDetectorSummary;
  };
  frames: CaptureFrameExport[];
}

export function createCaptureExport(
  observations: readonly ABObservation[],
  metadata: CaptureMetadata,
): CaptureExport {
  const first = observations[0];
  const last = observations.at(-1);
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    metadata,
    summary: {
      frameCount: observations.length,
      durationMs: first && last ? Math.max(0, last.timestampMs - first.timestampMs) : 0,
      sampleRate: first?.sampleRate ?? null,
      frameSize: first?.frameSize ?? null,
      signalStates: countValues(observations.map((observation) => observation.signal.state)),
      pitchy: summarizeDetector(observations.map((observation) => observation.pitchy)),
      yin: summarizeDetector(observations.map((observation) => observation.yin)),
    },
    frames: observations.map((observation) => ({
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

export function serializeCapture(report: CaptureExport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatCaptureAsText(report: CaptureExport): string {
  const { summary, metadata } = report;
  return [
    "Vocal Range Technical Spike Capture",
    `Configuration: ${metadata.configurationId}`,
    `Started: ${metadata.startedAt}`,
    `Browser: ${metadata.userAgent}`,
    `Frames: ${summary.frameCount}; duration: ${summary.durationMs.toFixed(0)} ms`,
    `Audio: ${summary.sampleRate ?? "n/a"} Hz; ${summary.frameSize ?? "n/a"} samples`,
    detectorText("Pitchy", summary.pitchy, summary.frameCount),
    detectorText("YIN", summary.yin, summary.frameCount),
    `Signal states: ${JSON.stringify(summary.signalStates)}`,
  ].join("\n");
}

function summarizeDetector(
  observations: readonly DetectorObservation[],
): CaptureDetectorSummary {
  const estimates = observations.flatMap((observation) =>
    observation.estimate ? [observation.estimate] : [],
  );
  const times = observations.map((observation) => observation.processingTimeMs);
  return {
    detectedFrames: estimates.length,
    detectionRate: observations.length > 0 ? estimates.length / observations.length : 0,
    stableFrames: observations.filter((observation) => observation.stable.state === "stable").length,
    medianFrequencyHz: estimates.length > 0
      ? percentile(estimates.map((estimate) => estimate.frequencyHz), 0.5)
      : null,
    medianConfidence: estimates.length > 0
      ? percentile(estimates.map((estimate) => estimate.confidence), 0.5)
      : null,
    processingTimeP50Ms: times.length > 0 ? percentile(times, 0.5) : 0,
    processingTimeP95Ms: times.length > 0 ? percentile(times, 0.95) : 0,
    notes: countValues(observations.flatMap((observation) =>
      observation.note ? [observation.note.note] : [],
    )),
    rejectReasons: countValues(observations.flatMap((observation) =>
      observation.stable.rejectReason ? [observation.stable.rejectReason] : [],
    )),
  };
}

function exportDetectorFrame(observation: DetectorObservation): DetectorFrameExport {
  return {
    frequencyHz: observation.estimate?.frequencyHz ?? null,
    confidence: observation.estimate?.confidence ?? null,
    note: observation.note?.note ?? null,
    cents: observation.note?.cents ?? null,
    stableState: observation.stable.state,
    stableDurationMs: observation.stable.stableDurationMs,
    rejectReason: observation.stable.rejectReason,
    processingTimeMs: observation.processingTimeMs,
  };
}

function countValues(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function detectorText(
  label: string,
  summary: CaptureDetectorSummary,
  frameCount: number,
): string {
  return `${label}: detected ${summary.detectedFrames}/${frameCount}; stable ${summary.stableFrames}; ` +
    `median ${summary.medianFrequencyHz?.toFixed(2) ?? "n/a"} Hz; ` +
    `time p50/p95 ${summary.processingTimeP50Ms.toFixed(3)}/${summary.processingTimeP95Ms.toFixed(3)} ms`;
}
