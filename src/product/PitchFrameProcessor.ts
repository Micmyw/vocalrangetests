import { mapFrequencyToNote, type NoteMapping } from "../dsp/NoteMapper";
import {
  SignalQualityEvaluator,
  type SignalQuality,
} from "../dsp/SignalQualityEvaluator";
import {
  StableNoteDetector,
  type StableStatus,
} from "../dsp/StableNoteDetector";
import type { PitchDetectorAdapter, PitchEstimate } from "../dsp/types";

export interface PitchFrameObservation {
  timestampMs: number;
  sampleRate: number;
  estimate: PitchEstimate | null;
  note: NoteMapping | null;
  signal: SignalQuality;
  stable: StableStatus;
  processingTimeMs: number;
}

export interface PitchFrameProcessorOptions {
  pitchy: PitchDetectorAdapter;
  quality?: SignalQualityEvaluator;
  stable?: StableNoteDetector;
  now?: () => number;
}

export class PitchFrameProcessor {
  private readonly pitchy: PitchDetectorAdapter;
  private readonly quality: SignalQualityEvaluator;
  private readonly stable: StableNoteDetector;
  private readonly now: () => number;

  constructor(options: PitchFrameProcessorOptions) {
    this.pitchy = options.pitchy;
    this.quality = options.quality ?? new SignalQualityEvaluator();
    this.stable = options.stable ?? new StableNoteDetector();
    this.now = options.now ?? (() => performance.now());
  }

  get currentStable(): StableStatus {
    return this.stable.current;
  }

  beginNoiseCalibration(): void {
    this.quality.beginCalibration();
    this.stable.reset();
  }

  recordNoiseFrame(frame: Float32Array): SignalQuality {
    return this.quality.recordNoiseFrame(frame);
  }

  finishNoiseCalibration(): number {
    return this.quality.finishCalibration();
  }

  resetStability(): void {
    this.stable.reset();
  }

  reset(): void {
    this.quality.reset();
    this.stable.reset();
  }

  processFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): PitchFrameObservation {
    if (frame.length !== this.pitchy.frameSize) {
      throw new Error(`Pitch processor expected ${this.pitchy.frameSize} samples, received ${frame.length}`);
    }
    const metrics = this.quality.measure(frame);
    const startedAt = this.now();
    const estimate = this.pitchy.detect(frame, sampleRate);
    const processingTimeMs = this.now() - startedAt;
    const signal = this.quality.evaluateMeasurement(metrics, estimate);
    const stable = this.stable.update({ timestampMs, estimate, quality: signal });

    return {
      timestampMs,
      sampleRate,
      estimate,
      note: mapFrequencyToNote(estimate?.frequencyHz ?? 0),
      signal,
      stable,
      processingTimeMs,
    };
  }
}
