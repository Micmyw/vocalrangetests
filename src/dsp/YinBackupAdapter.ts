import type { PitchDetectorAdapter, PitchEstimate } from "./types";

export interface YinBackupOptions {
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  threshold?: number;
  silenceRms?: number;
}

export class YinBackupAdapter implements PitchDetectorAdapter {
  readonly id = "yin" as const;
  readonly frameSize: number;

  private readonly minFrequencyHz: number;
  private readonly maxFrequencyHz: number;
  private readonly threshold: number;
  private readonly silenceRms: number;
  private readonly cmnd: Float64Array;

  constructor(frameSize: number, options: YinBackupOptions = {}) {
    this.frameSize = frameSize;
    this.minFrequencyHz = options.minFrequencyHz ?? 45;
    this.maxFrequencyHz = options.maxFrequencyHz ?? 2_000;
    this.threshold = options.threshold ?? 0.15;
    this.silenceRms = options.silenceRms ?? 1e-5;
    this.cmnd = new Float64Array(frameSize);
  }

  detect(frame: Float32Array, sampleRate: number): PitchEstimate | null {
    if (frame.length !== this.frameSize) {
      throw new Error(`YIN expected ${this.frameSize} samples, received ${frame.length}`);
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error("sampleRate must be a positive finite number");
    }

    let squareSum = 0;
    for (let index = 0; index < frame.length; index += 1) {
      squareSum += frame[index] * frame[index];
    }
    if (Math.sqrt(squareSum / frame.length) < this.silenceRms) return null;

    const minTau = Math.max(2, Math.floor(sampleRate / this.maxFrequencyHz));
    const maxTau = Math.min(
      this.frameSize - 2,
      Math.ceil(sampleRate / this.minFrequencyHz),
    );
    if (maxTau <= minTau) return null;

    const comparisonLength = this.frameSize - maxTau;
    this.cmnd[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau <= maxTau; tau += 1) {
      let difference = 0;
      for (let index = 0; index < comparisonLength; index += 1) {
        const delta = frame[index] - frame[index + tau];
        difference += delta * delta;
      }
      runningSum += difference;
      this.cmnd[tau] = runningSum === 0 ? 1 : (difference * tau) / runningSum;
    }

    let tauEstimate = -1;
    for (let tau = minTau; tau <= maxTau; tau += 1) {
      if (this.cmnd[tau] < this.threshold) {
        while (tau < maxTau && this.cmnd[tau + 1] < this.cmnd[tau]) tau += 1;
        tauEstimate = tau;
        break;
      }
    }
    if (tauEstimate < 0) return null;

    const previous = this.cmnd[Math.max(1, tauEstimate - 1)];
    const current = this.cmnd[tauEstimate];
    const next = this.cmnd[Math.min(maxTau, tauEstimate + 1)];
    const denominator = 2 * (2 * current - next - previous);
    const refinedTau = denominator === 0
      ? tauEstimate
      : tauEstimate + (next - previous) / denominator;
    const frequencyHz = sampleRate / refinedTau;

    if (
      !Number.isFinite(frequencyHz) ||
      frequencyHz < this.minFrequencyHz ||
      frequencyHz > this.maxFrequencyHz
    ) {
      return null;
    }

    return {
      frequencyHz,
      confidence: Math.max(0, Math.min(1, 1 - current)),
    };
  }
}
