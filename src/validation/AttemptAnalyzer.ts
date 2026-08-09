import { percentile } from "../benchmark/metrics";
import type { ABObservation, DetectorObservation } from "../dsp/ABRunner";
import { mapFrequencyToNote } from "../dsp/NoteMapper";
import type {
  AttemptResult,
  DetectorAttemptResult,
  EndpointType,
  PhonationTag,
  ValidationContext,
} from "./types";

export interface AnalyzeAttemptInput {
  observations: readonly ABObservation[];
  startedAtMs: number;
  endedAtMs: number;
  completed: boolean;
  endpoint: EndpointType;
  endpointAttemptNumber: number;
  tags: readonly PhonationTag[];
  context: ValidationContext;
}

const TERMINAL_CONFIRMATION_MS = 800;
const MINIMUM_TERMINAL_STABLE_RATIO = 0.75;
const MINIMUM_CONFIDENCE = 0.75;
const MAXIMUM_POST_LOCK_DEVIATION_CENTS = 100;
const MINIMUM_POST_LOCK_DRIFT_MS = 150;

interface TimedDetectorObservation {
  timestampMs: number;
  signal: ABObservation["signal"];
  value: DetectorObservation;
}

export function analyzeAttempt(input: AnalyzeAttemptInput): AttemptResult {
  const noiseFloors = input.observations.map((item) => item.signal.noiseFloorRms);
  const finiteSnr = input.observations
    .map((item) => item.signal.snrDb)
    .filter(Number.isFinite);
  return {
    attemptId: `${input.context.sessionId}-${input.endpoint}-${input.endpointAttemptNumber}-${Math.round(input.startedAtMs)}`,
    endpoint: input.endpoint,
    endpointAttemptNumber: input.endpointAttemptNumber,
    tags: [...input.tags],
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    durationMs: Math.max(0, input.endedAtMs - input.startedAtMs),
    completed: input.completed,
    context: input.context,
    signal: {
      rmsMedian: median(input.observations.map((item) => item.signal.rms)) ?? 0,
      snrMedianDb: median(finiteSnr),
      clipping: input.observations.some((item) => item.signal.clipping),
      noiseFloorRms: median(noiseFloors) ?? 0,
    },
    pitchy: analyzeDetector(
      "pitchy",
      input.observations.map((item) => ({
        timestampMs: item.timestampMs,
        signal: item.signal,
        value: item.pitchy,
      })),
      input.startedAtMs,
      input.endedAtMs,
      input.completed,
    ),
    yin: analyzeDetector(
      "yin",
      input.observations.map((item) => ({
        timestampMs: item.timestampMs,
        signal: item.signal,
        value: item.yin,
      })),
      input.startedAtMs,
      input.endedAtMs,
      input.completed,
    ),
    observations: [...input.observations],
  };
}

function analyzeDetector(
  detector: "pitchy" | "yin",
  observations: readonly TimedDetectorObservation[],
  startedAtMs: number,
  endedAtMs: number,
  completed: boolean,
): DetectorAttemptResult {
  const stable = observations.filter(isStableVoicedObservation);
  const terminal = observations.filter(
    (item) => item.timestampMs >= endedAtMs - TERMINAL_CONFIRMATION_MS,
  );
  const terminalStable = terminal.filter(isStableVoicedObservation);
  const terminalStableRatio = terminal.length > 0 ? terminalStable.length / terminal.length : 0;
  const octaveAmbiguous = observations.some(
    (item) => item.value.stable.rejectReason === "octave-ambiguous",
  );
  const postLockDrift = stable.length > 0 && hasPostLockDrift(
    observations,
    stable[0].timestampMs,
    stable[0].value.stable.frequencyHz!,
  );
  const terminalConfirmed = terminalStableRatio >= MINIMUM_TERMINAL_STABLE_RATIO;
  const rejectReasons = observations.flatMap((item) =>
    item.value.stable.rejectReason ? [item.value.stable.rejectReason] : [],
  );
  const rejection = stable.length === 0
    ? dominantValue(rejectReasons)
    : postLockDrift
      ? "post-lock-drift"
      : !terminalConfirmed
        ? "insufficient-terminal-stability"
        : octaveAmbiguous
          ? "octave-ambiguous"
          : !completed
            ? "capture-incomplete"
            : null;
  const success = completed && rejection === null;
  const representativeHz = success
    ? logMedian(stable.map((item) => item.value.stable.frequencyHz!))
    : null;
  const mapping = representativeHz === null ? null : mapFrequencyToNote(representativeHz);
  const confidences = stable.flatMap((item) =>
    item.value.estimate ? [item.value.estimate.confidence] : [],
  );
  const processingTimes = observations.map((item) => item.value.processingTimeMs);
  return {
    detector,
    success,
    noDetection: observations.every((item) => item.value.estimate === null),
    frequencyHz: representativeHz,
    confidence: median(confidences),
    midi: mapping?.midi ?? null,
    note: mapping?.note ?? null,
    cents: mapping?.cents ?? null,
    stableLatencyMs: success
      ? Math.max(0, stable[0].timestampMs - startedAtMs)
      : null,
    octaveAmbiguous,
    rejectReason: rejection,
    processingTimeP50Ms: processingTimes.length > 0 ? percentile(processingTimes, 0.5) : 0,
    processingTimeP95Ms: processingTimes.length > 0 ? percentile(processingTimes, 0.95) : 0,
  };
}

function isStableVoicedObservation(item: TimedDetectorObservation): boolean {
  return item.signal.state === "usable" &&
    item.value.stable.state === "stable" &&
    item.value.stable.frequencyHz !== null &&
    Number.isFinite(item.value.stable.frequencyHz) &&
    item.value.estimate !== null &&
    item.value.estimate.confidence >= MINIMUM_CONFIDENCE;
}

function hasPostLockDrift(
  observations: readonly TimedDetectorObservation[],
  lockedAtMs: number,
  lockedFrequencyHz: number,
): boolean {
  let driftStartedAtMs: number | null = null;
  for (const item of observations) {
    if (item.timestampMs < lockedAtMs) continue;
    const estimate = item.value.estimate;
    const usable = item.signal.state === "usable" &&
      estimate !== null &&
      estimate.confidence >= MINIMUM_CONFIDENCE &&
      Number.isFinite(estimate.frequencyHz) &&
      estimate.frequencyHz > 0;
    if (!usable) {
      driftStartedAtMs = null;
      continue;
    }
    const deviation = Math.abs(1200 * Math.log2(estimate!.frequencyHz / lockedFrequencyHz));
    if (deviation <= MAXIMUM_POST_LOCK_DEVIATION_CENTS) {
      driftStartedAtMs = null;
      continue;
    }
    driftStartedAtMs ??= item.timestampMs;
    if (item.timestampMs - driftStartedAtMs >= MINIMUM_POST_LOCK_DRIFT_MS) return true;
  }
  return false;
}

function logMedian(frequencies: readonly number[]): number | null {
  const center = median(frequencies.map((frequency) => Math.log2(frequency)));
  return center === null ? null : 2 ** center;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return percentile(values, 0.5);
}

function dominantValue(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  const counts = new Map<string, { count: number; lastIndex: number }>();
  values.forEach((value, index) => {
    const current = counts.get(value);
    counts.set(value, { count: (current?.count ?? 0) + 1, lastIndex: index });
  });
  return [...counts.entries()].sort((left, right) =>
    right[1].count - left[1].count || right[1].lastIndex - left[1].lastIndex,
  )[0][0];
}
