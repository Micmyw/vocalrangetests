import { centsBetween } from "../dsp/NoteMapper";

export interface DetectorMetricObservation {
  expectedFrequencyHz: number | null;
  detectedFrequencyHz: number | null;
  processingTimeMs: number;
}

export interface DetectorMetricSummary {
  expectedPitchFrames: number;
  detectedPitchFrames: number;
  silenceFrames: number;
  medianCentsError: number | null;
  p95CentsError: number | null;
  octaveErrorRate: number;
  noDetectionRate: number;
  silenceFalseDetectionRate: number;
  processingTimeP50Ms: number;
  processingTimeP95Ms: number;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function summarizeDetectorObservations(
  observations: readonly DetectorMetricObservation[],
): DetectorMetricSummary {
  const pitched = observations.filter((observation) => observation.expectedFrequencyHz !== null);
  const silence = observations.filter((observation) => observation.expectedFrequencyHz === null);
  const detected = pitched.filter((observation) => observation.detectedFrequencyHz !== null);
  const errors = detected.map((observation) => Math.abs(centsBetween(
    observation.detectedFrequencyHz!,
    observation.expectedFrequencyHz!,
  )));
  const octaveErrors = errors.filter((error) => {
    const nearestOctave = Math.round(error / 1200) * 1200;
    return nearestOctave >= 1200 && Math.abs(error - nearestOctave) <= 100;
  }).length;
  const times = observations.map((observation) => observation.processingTimeMs);

  return {
    expectedPitchFrames: pitched.length,
    detectedPitchFrames: detected.length,
    silenceFrames: silence.length,
    medianCentsError: errors.length > 0 ? percentile(errors, 0.5) : null,
    p95CentsError: errors.length > 0 ? percentile(errors, 0.95) : null,
    octaveErrorRate: pitched.length > 0 ? octaveErrors / pitched.length : 0,
    noDetectionRate: pitched.length > 0 ? (pitched.length - detected.length) / pitched.length : 0,
    silenceFalseDetectionRate: silence.length > 0
      ? silence.filter((observation) => observation.detectedFrequencyHz !== null).length / silence.length
      : 0,
    processingTimeP50Ms: times.length > 0 ? percentile(times, 0.5) : 0,
    processingTimeP95Ms: times.length > 0 ? percentile(times, 0.95) : 0,
  };
}
