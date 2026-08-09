import type { ABObservation } from "../dsp/ABRunner";

export type PhonationTag =
  | "modal"
  | "head-falsetto"
  | "breathy"
  | "vibrato"
  | "glide"
  | "fry";

export const PHONATION_TAGS: readonly PhonationTag[] = [
  "modal",
  "head-falsetto",
  "breathy",
  "vibrato",
  "glide",
  "fry",
];

export type EndpointType = "lowest" | "highest";
export type DetectorId = "pitchy" | "yin";
export type ValidationPhase =
  | "setup"
  | "requesting-permission"
  | "calibrating"
  | "ready"
  | "attempting"
  | "summary"
  | "stopped"
  | "error";

export interface DeviceEnvironment {
  os: string;
  browser: string;
  device: string;
  userAgent: string;
}

export type MediaTrackSettingsSnapshot = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ValidationContext {
  sessionId: string;
  testerId: string;
  createdAt: string;
  environment: DeviceEnvironment;
  sampleRate: number;
  frameSize: 4096;
  cadenceHz: 20;
  trackSettings: MediaTrackSettingsSnapshot | null;
  simulated: boolean;
}

export interface CalibrationSummary {
  durationMs: number;
  frameCount: number;
  noiseFloorRms: number;
  sampleRate: number;
}

export interface DetectorAttemptResult {
  detector: DetectorId;
  success: boolean;
  noDetection: boolean;
  frequencyHz: number | null;
  confidence: number | null;
  midi: number | null;
  note: string | null;
  cents: number | null;
  stableLatencyMs: number | null;
  octaveAmbiguous: boolean;
  rejectReason: string | null;
  processingTimeP50Ms: number;
  processingTimeP95Ms: number;
}

export interface AttemptSignalSummary {
  rmsMedian: number;
  snrMedianDb: number | null;
  clipping: boolean;
  noiseFloorRms: number;
}

export interface AttemptResult {
  attemptId: string;
  endpoint: EndpointType;
  endpointAttemptNumber: number;
  tags: PhonationTag[];
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  completed: boolean;
  context: ValidationContext;
  signal: AttemptSignalSummary;
  pitchy: DetectorAttemptResult;
  yin: DetectorAttemptResult;
  observations: readonly ABObservation[];
}

export interface EndpointSummary {
  endpoint: EndpointType;
  completed: boolean;
  attemptCount: number;
  successfulPitchyCaptures: number;
  notes: string[];
  midi: number[];
  maximumSemitoneDifference: number | null;
  repeatableWithinOneSemitone: boolean | null;
  pitchySuccessRate: number;
  yinSuccessRate: number;
}

export interface DetectorSessionSummary {
  successCount: number;
  successRate: number;
  noDetectionCount: number;
  noDetectionRate: number;
  octaveAmbiguityCount: number;
  processingTimeP50Ms: number;
  processingTimeP95Ms: number;
}

export interface ValidationSessionSummary {
  attemptCount: number;
  retryCount: number;
  octaveDisagreementCount: number;
  frameComparisonCount: number;
  frameOctaveDisagreementCount: number;
  frameOctaveDisagreementRate: number;
  pitchy: DetectorSessionSummary;
  yin: DetectorSessionSummary;
  endpoints: Record<EndpointType, EndpointSummary>;
}
