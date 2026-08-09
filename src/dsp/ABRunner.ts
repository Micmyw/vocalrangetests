import { mapFrequencyToNote, type NoteMapping } from "./NoteMapper";
import { SignalQualityEvaluator, type SignalQuality } from "./SignalQualityEvaluator";
import { StableNoteDetector, type StableStatus } from "./StableNoteDetector";
import type { PitchDetectorAdapter, PitchEstimate } from "./types";

export interface DetectorObservation {
  estimate: PitchEstimate | null;
  note: NoteMapping | null;
  processingTimeMs: number;
  stable: StableStatus;
}

export interface ABObservation {
  timestampMs: number;
  sampleRate: number;
  frameSize: number;
  signal: SignalQuality;
  pitchy: DetectorObservation;
  yin: DetectorObservation;
}

export interface ABRunnerOptions {
  pitchy: PitchDetectorAdapter;
  yin: PitchDetectorAdapter;
  quality?: SignalQualityEvaluator;
  pitchyStable?: StableNoteDetector;
  yinStable?: StableNoteDetector;
  now?: () => number;
  historyLimit?: number;
}

export class ABRunner {
  private readonly pitchy: PitchDetectorAdapter;
  private readonly yin: PitchDetectorAdapter;
  private readonly quality: SignalQualityEvaluator;
  private readonly pitchyStable: StableNoteDetector;
  private readonly yinStable: StableNoteDetector;
  private readonly now: () => number;
  private readonly historyLimit: number;
  private observations: ABObservation[] = [];

  constructor(options: ABRunnerOptions) {
    if (options.pitchy.frameSize !== options.yin.frameSize) {
      throw new Error("A/B detectors must use the same frame size");
    }
    this.pitchy = options.pitchy;
    this.yin = options.yin;
    this.quality = options.quality ?? new SignalQualityEvaluator();
    this.pitchyStable = options.pitchyStable ?? new StableNoteDetector();
    this.yinStable = options.yinStable ?? new StableNoteDetector();
    this.now = options.now ?? (() => performance.now());
    this.historyLimit = options.historyLimit ?? 1_800;
  }

  get history(): readonly ABObservation[] {
    return this.observations;
  }

  beginNoiseCalibration(): void {
    this.quality.beginCalibration();
  }

  finishNoiseCalibration(): number {
    return this.quality.finishCalibration();
  }

  processFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
    calibrating = false,
  ): ABObservation {
    if (frame.length !== this.pitchy.frameSize) {
      throw new Error(`A/B runner expected ${this.pitchy.frameSize} samples, received ${frame.length}`);
    }
    const signal = calibrating
      ? this.quality.recordNoiseFrame(frame)
      : this.quality.evaluate(frame);
    const pitchy = this.measureDetector(this.pitchy, frame, sampleRate);
    const yin = this.measureDetector(this.yin, frame, sampleRate);

    const observation: ABObservation = {
      timestampMs,
      sampleRate,
      frameSize: frame.length,
      signal,
      pitchy: {
        ...pitchy,
        stable: this.pitchyStable.update({ timestampMs, estimate: pitchy.estimate, quality: signal }),
      },
      yin: {
        ...yin,
        stable: this.yinStable.update({ timestampMs, estimate: yin.estimate, quality: signal }),
      },
    };

    this.observations.push(observation);
    if (this.observations.length > this.historyLimit) this.observations.shift();
    return observation;
  }

  reset(): void {
    this.observations = [];
    this.quality.reset();
    this.resetStability();
  }

  resetStability(): void {
    this.pitchyStable.reset();
    this.yinStable.reset();
  }

  private measureDetector(
    detector: PitchDetectorAdapter,
    frame: Float32Array,
    sampleRate: number,
  ): Omit<DetectorObservation, "stable"> {
    const startedAt = this.now();
    const estimate = detector.detect(frame, sampleRate);
    const processingTimeMs = this.now() - startedAt;
    return {
      estimate,
      note: mapFrequencyToNote(estimate?.frequencyHz ?? 0),
      processingTimeMs,
    };
  }
}
