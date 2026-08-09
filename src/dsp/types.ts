export type DetectorId = "pitchy" | "yin";

export interface PitchEstimate {
  frequencyHz: number;
  confidence: number;
}

export interface PitchDetectorAdapter {
  readonly id: DetectorId;
  readonly frameSize: number;
  detect(frame: Float32Array, sampleRate: number): PitchEstimate | null;
}
