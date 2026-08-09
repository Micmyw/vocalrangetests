import { PitchDetector } from "pitchy";
import type { PitchDetectorAdapter, PitchEstimate } from "./types";

export interface PitchyMpmOptions {
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  clarityThreshold?: number;
  silenceRms?: number;
}

export class PitchyMpmAdapter implements PitchDetectorAdapter {
  readonly id = "pitchy" as const;
  readonly frameSize: number;

  private readonly detector: PitchDetector<Float32Array>;
  private readonly minFrequencyHz: number;
  private readonly maxFrequencyHz: number;
  private readonly silenceRms: number;

  constructor(frameSize: number, options: PitchyMpmOptions = {}) {
    this.frameSize = frameSize;
    this.minFrequencyHz = options.minFrequencyHz ?? 45;
    this.maxFrequencyHz = options.maxFrequencyHz ?? 2_000;
    this.silenceRms = options.silenceRms ?? 1e-5;
    this.detector = PitchDetector.forFloat32Array(frameSize);
    this.detector.clarityThreshold = options.clarityThreshold ?? 0.9;
  }

  detect(frame: Float32Array, sampleRate: number): PitchEstimate | null {
    if (frame.length !== this.frameSize) {
      throw new Error(`Pitchy expected ${this.frameSize} samples, received ${frame.length}`);
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error("sampleRate must be a positive finite number");
    }

    let squareSum = 0;
    for (let index = 0; index < frame.length; index += 1) {
      squareSum += frame[index] * frame[index];
    }
    if (Math.sqrt(squareSum / frame.length) < this.silenceRms) return null;

    const [frequencyHz, confidence] = this.detector.findPitch(frame, sampleRate);
    if (
      !Number.isFinite(frequencyHz) ||
      frequencyHz < this.minFrequencyHz ||
      frequencyHz > this.maxFrequencyHz ||
      confidence <= 0
    ) {
      return null;
    }

    return { frequencyHz, confidence };
  }
}
