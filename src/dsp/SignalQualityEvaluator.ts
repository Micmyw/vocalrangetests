import type { PitchEstimate } from "./types";

export type SignalState =
  | "calibrating"
  | "silence"
  | "too-quiet"
  | "noisy"
  | "clipped"
  | "no-pitch"
  | "low-confidence"
  | "usable";

export interface SignalQuality {
  state: SignalState;
  rms: number;
  peak: number;
  noiseFloorRms: number;
  noiseFloorDb: number;
  snrDb: number;
  clipping: boolean;
  clippedSampleRatio: number;
  rejectReason: string | null;
}

export interface SignalQualityOptions {
  minSnrDb?: number;
  minimumRms?: number;
  absoluteSilenceRms?: number;
  clippingAmplitude?: number;
  clippedSampleRatio?: number;
  defaultNoiseFloorRms?: number;
  minimumConfidence?: number;
}

export interface RawSignalMetrics {
  rms: number;
  peak: number;
  clippedSampleRatio: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export class SignalQualityEvaluator {
  private readonly minSnrDb: number;
  private readonly minimumRms: number;
  private readonly absoluteSilenceRms: number;
  private readonly clippingAmplitude: number;
  private readonly clippingRatioThreshold: number;
  private readonly defaultNoiseFloorRms: number;
  private readonly minimumConfidence: number;

  private calibrationValues: number[] | null = null;
  private noiseFloorRms: number;

  constructor(options: SignalQualityOptions = {}) {
    this.minSnrDb = options.minSnrDb ?? 10;
    this.minimumRms = options.minimumRms ?? 0.001;
    this.absoluteSilenceRms = options.absoluteSilenceRms ?? 1e-5;
    this.clippingAmplitude = options.clippingAmplitude ?? 0.995;
    this.clippingRatioThreshold = options.clippedSampleRatio ?? 0.01;
    this.defaultNoiseFloorRms = options.defaultNoiseFloorRms ?? 0.0001;
    this.minimumConfidence = options.minimumConfidence ?? 0.75;
    this.noiseFloorRms = this.defaultNoiseFloorRms;
  }

  beginCalibration(): void {
    this.calibrationValues = [];
  }

  recordNoiseFrame(frame: Float32Array): SignalQuality {
    if (this.calibrationValues === null) this.beginCalibration();
    const level = this.measure(frame);
    this.calibrationValues!.push(level.rms);
    const currentFloor = median(this.calibrationValues!);
    if (Number.isFinite(currentFloor)) this.noiseFloorRms = currentFloor;
    return this.resultFor(level, "calibrating", "noise-floor-calibration");
  }

  finishCalibration(): number {
    if (this.calibrationValues && this.calibrationValues.length > 0) {
      this.noiseFloorRms = Math.max(
        this.absoluteSilenceRms,
        median(this.calibrationValues),
      );
    }
    this.calibrationValues = null;
    return this.noiseFloorRms;
  }

  reset(): void {
    this.calibrationValues = null;
    this.noiseFloorRms = this.defaultNoiseFloorRms;
  }

  evaluate(frame: Float32Array): SignalQuality {
    const level = this.measure(frame);
    return this.evaluateSignalOnly(level);
  }

  evaluateMeasurement(
    level: RawSignalMetrics,
    estimate: PitchEstimate | null,
  ): SignalQuality {
    const signal = this.evaluateSignalOnly(level);
    if (signal.state !== "usable") return signal;
    if (estimate === null || !Number.isFinite(estimate.frequencyHz) || estimate.frequencyHz <= 0) {
      return this.resultFor(level, "no-pitch", "no-pitch");
    }
    if (!Number.isFinite(estimate.confidence) || estimate.confidence < this.minimumConfidence) {
      return this.resultFor(level, "low-confidence", "low-confidence");
    }
    return signal;
  }

  measure(frame: Float32Array): RawSignalMetrics {
    if (frame.length === 0) return { rms: 0, peak: 0, clippedSampleRatio: 0 };
    let squareSum = 0;
    let peak = 0;
    let clippedSamples = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const absolute = Math.abs(frame[index]);
      squareSum += frame[index] * frame[index];
      peak = Math.max(peak, absolute);
      if (absolute >= this.clippingAmplitude) clippedSamples += 1;
    }
    return {
      rms: Math.sqrt(squareSum / frame.length),
      peak,
      clippedSampleRatio: clippedSamples / frame.length,
    };
  }

  private evaluateSignalOnly(level: RawSignalMetrics): SignalQuality {
    const clipping = level.clippedSampleRatio >= this.clippingRatioThreshold;
    if (clipping) return this.resultFor(level, "clipped", "input-clipping");
    if (level.rms < this.absoluteSilenceRms) {
      return this.resultFor(level, "silence", "silence");
    }
    if (level.rms < this.minimumRms) {
      return this.resultFor(level, "too-quiet", "signal-too-quiet");
    }

    const snrDb = this.snrFor(level.rms);
    if (snrDb < this.minSnrDb) {
      return this.resultFor(level, "noisy", "snr-below-threshold");
    }
    return this.resultFor(level, "usable", null);
  }

  private resultFor(
    level: RawSignalMetrics,
    state: SignalState,
    rejectReason: string | null,
  ): SignalQuality {
    return {
      state,
      rms: level.rms,
      peak: level.peak,
      noiseFloorRms: this.noiseFloorRms,
      noiseFloorDb: 20 * Math.log10(Math.max(this.noiseFloorRms, 1e-12)),
      snrDb: this.snrFor(level.rms),
      clipping: level.clippedSampleRatio >= this.clippingRatioThreshold,
      clippedSampleRatio: level.clippedSampleRatio,
      rejectReason,
    };
  }

  private snrFor(rms: number): number {
    if (rms <= 0) return Number.NEGATIVE_INFINITY;
    return 20 * Math.log10(rms / Math.max(this.noiseFloorRms, 1e-12));
  }
}
