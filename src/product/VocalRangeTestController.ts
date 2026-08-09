import type { MicrophoneFrameInfo } from "../audio/MicrophoneController";
import type { SignalQuality } from "../dsp/SignalQualityEvaluator";
import type { EndpointCaptureStatus } from "./EndpointCaptureController";
import { failureMessageFor } from "./FailureMessages";
import type { PitchFrameObservation } from "./PitchFrameProcessor";
import { PRODUCT_AUDIO_CONFIG } from "./ProductConfig";
import { calculateRange } from "./RangeCalculator";
import { calculateRangeOverlap, type RangeOverlap } from "./RangeOverlapCalculator";
import type {
  CapturedEndpoint,
  EndpointKind,
  VocalRangePhase,
  VocalRangeResult,
} from "./types";
import type { AnalyticsEvent } from "./analytics";

export type RecoveryAction = "retry-capture" | "reopen-microphone" | null;

export interface VocalRangeTestSnapshot {
  phase: VocalRangePhase;
  activeEndpoint: EndpointKind | null;
  calibrationRemainingMs: number | null;
  captureElapsedMs: number | null;
  stableDurationMs: number;
  statusMessage: string;
  errorMessage: string | null;
  recoveryAction: RecoveryAction;
  lowest: CapturedEndpoint | null;
  highest: CapturedEndpoint | null;
  result: VocalRangeResult | null;
  overlaps: RangeOverlap[];
  noiseFloorRms: number | null;
  stableLocked: boolean;
}

export interface VocalRangeTestViewPort {
  render(snapshot: VocalRangeTestSnapshot): void;
}

export interface MicrophonePort {
  start(): Promise<MicrophoneFrameInfo>;
  stop(): Promise<void>;
}

export interface PitchFrameProcessorPort {
  beginNoiseCalibration(): void;
  recordNoiseFrame(frame: Float32Array): SignalQuality;
  finishNoiseCalibration(): number;
  resetStability(): void;
  reset(): void;
  processFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): PitchFrameObservation;
}

interface CapturePort {
  update(observation: PitchFrameObservation): EndpointCaptureStatus;
}

export interface VocalRangeTestControllerOptions {
  processor: PitchFrameProcessorPort;
  view: VocalRangeTestViewPort;
  createMicrophone: (
    onFrame: (frame: Float32Array, sampleRate: number, timestampMs: number) => void,
  ) => MicrophonePort;
  createCapture: (options: { startedAtMs: number }) => CapturePort;
  analytics?: { track(event: AnalyticsEvent): boolean };
}

export class VocalRangeTestController {
  private readonly processor: PitchFrameProcessorPort;
  private readonly view: VocalRangeTestViewPort;
  private readonly createMicrophone: VocalRangeTestControllerOptions["createMicrophone"];
  private readonly createCapture: VocalRangeTestControllerOptions["createCapture"];
  private readonly analytics: NonNullable<VocalRangeTestControllerOptions["analytics"]>;

  private currentPhase: VocalRangePhase = "intro";
  private currentEndpoint: EndpointKind | null = null;
  private microphone: MicrophonePort | null = null;
  private microphoneGeneration = 0;
  private calibrationStartedAtMs: number | null = null;
  private activeCapture: CapturePort | null = null;
  private lowest: CapturedEndpoint | null = null;
  private highest: CapturedEndpoint | null = null;
  private result: VocalRangeResult | null = null;
  private overlaps: RangeOverlap[] = [];
  private retestTarget: EndpointKind | null = null;
  private snapshot: VocalRangeTestSnapshot = initialSnapshot();

  constructor(options: VocalRangeTestControllerOptions) {
    this.processor = options.processor;
    this.view = options.view;
    this.createMicrophone = options.createMicrophone;
    this.createCapture = options.createCapture;
    this.analytics = options.analytics ?? { track: () => false };
    this.render();
  }

  get phase(): VocalRangePhase {
    return this.currentPhase;
  }

  async startTest(): Promise<void> {
    this.analytics.track("test_started");
    await this.stopMicrophone();
    this.processor.reset();
    this.lowest = null;
    this.highest = null;
    this.result = null;
    this.overlaps = [];
    this.retestTarget = null;
    await this.openAndCalibrate("lowest");
  }

  startCapture(): void {
    if (!this.currentEndpoint || this.currentPhase !== `${this.currentEndpoint}-ready`) {
      throw new Error("The current endpoint is not ready to capture");
    }
    this.processor.resetStability();
    this.activeCapture = null;
    this.currentPhase = `${this.currentEndpoint}-capturing`;
    this.updateSnapshot({
      captureElapsedMs: 0,
      stableDurationMs: 0,
      statusMessage: `Listening for your ${this.currentEndpoint} comfortable note…`,
      errorMessage: null,
      recoveryAction: null,
      stableLocked: false,
    });
  }

  retryCapture(): void {
    if (this.currentPhase !== "recoverable-error" || this.snapshot.recoveryAction !== "retry-capture") {
      throw new Error("There is no failed capture to retry");
    }
    if (!this.currentEndpoint) throw new Error("Missing endpoint for retry");
    this.currentPhase = `${this.currentEndpoint}-ready`;
    this.render({ errorMessage: null, recoveryAction: null });
    this.startCapture();
  }

  async continueAfterSuccess(): Promise<void> {
    if (!this.currentEndpoint || this.currentPhase !== `${this.currentEndpoint}-success`) {
      throw new Error("There is no successful endpoint to continue from");
    }
    if (this.currentEndpoint === "lowest" && this.retestTarget === null) {
      this.currentEndpoint = "highest";
      this.currentPhase = "highest-ready";
      this.render({
        statusMessage: "Lowest note captured. Prepare your highest comfortable note.",
        stableLocked: false,
      });
      return;
    }
    await this.finishResult();
  }

  async retestEndpoint(endpoint: EndpointKind): Promise<void> {
    if (this.currentPhase !== "result") throw new Error("Endpoint retest is only available from Result");
    this.retestTarget = endpoint;
    this.analytics.track("retest_started");
    await this.openAndCalibrate(endpoint);
  }

  async reopenMicrophone(): Promise<void> {
    if (this.currentPhase !== "recoverable-error" || this.snapshot.recoveryAction !== "reopen-microphone") {
      throw new Error("The microphone does not need to be reopened");
    }
    await this.openAndCalibrate(this.currentEndpoint ?? "lowest");
  }

  async handleHidden(): Promise<void> {
    if (["intro", "result"].includes(this.currentPhase)) return;
    this.activeCapture = null;
    this.processor.resetStability();
    await this.stopMicrophone();
    this.currentPhase = "recoverable-error";
    this.render({
      statusMessage: "The active capture was cancelled when this page was hidden.",
      errorMessage: "Reopen your microphone to restart this step.",
      recoveryAction: "reopen-microphone",
      captureElapsedMs: null,
      stableDurationMs: 0,
      stableLocked: false,
    });
  }

  async testAgain(): Promise<void> {
    this.analytics.track("test_restarted");
    await this.stopMicrophone();
    this.processor.reset();
    this.currentPhase = "intro";
    this.currentEndpoint = null;
    this.lowest = null;
    this.highest = null;
    this.result = null;
    this.overlaps = [];
    this.retestTarget = null;
    this.snapshot = initialSnapshot();
    this.render();
  }

  private async openAndCalibrate(endpoint: EndpointKind): Promise<void> {
    await this.stopMicrophone();
    this.currentEndpoint = endpoint;
    this.currentPhase = "requesting-permission";
    this.calibrationStartedAtMs = null;
    this.activeCapture = null;
    this.processor.beginNoiseCalibration();
    this.render({
      activeEndpoint: endpoint,
      statusMessage: "Requesting microphone access…",
      errorMessage: null,
      recoveryAction: null,
      calibrationRemainingMs: PRODUCT_AUDIO_CONFIG.calibrationMs,
      captureElapsedMs: null,
      stableDurationMs: 0,
      stableLocked: false,
    });

    const generation = ++this.microphoneGeneration;
    const microphone = this.createMicrophone((frame, sampleRate, timestampMs) => {
      if (generation === this.microphoneGeneration) {
        this.processFrame(frame, sampleRate, timestampMs);
      }
    });
    this.microphone = microphone;
    try {
      await microphone.start();
      if (generation !== this.microphoneGeneration) return;
      this.analytics.track("microphone_ready");
      this.currentPhase = "calibrating";
      this.render({
        statusMessage: "Stay quiet while we check your room for 3 seconds.",
      });
    } catch (error) {
      if (this.microphone === microphone) this.microphone = null;
      this.currentPhase = "recoverable-error";
      this.render({
        statusMessage: "Microphone access is required to continue.",
        errorMessage: microphoneErrorMessage(error),
        recoveryAction: "reopen-microphone",
      });
    }
  }

  private processFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): void {
    if (this.currentPhase === "calibrating") {
      this.processCalibrationFrame(frame, timestampMs);
      return;
    }
    if (this.currentPhase.endsWith("-capturing")) {
      this.processCaptureFrame(frame, sampleRate, timestampMs);
    }
  }

  private processCalibrationFrame(frame: Float32Array, timestampMs: number): void {
    this.calibrationStartedAtMs ??= timestampMs;
    this.processor.recordNoiseFrame(frame);
    const elapsedMs = timestampMs - this.calibrationStartedAtMs;
    this.updateSnapshot({
      calibrationRemainingMs: Math.max(0, PRODUCT_AUDIO_CONFIG.calibrationMs - elapsedMs),
    });
    if (elapsedMs < PRODUCT_AUDIO_CONFIG.calibrationMs || !this.currentEndpoint) return;

    const noiseFloorRms = this.processor.finishNoiseCalibration();
    this.analytics.track("calibration_completed");
    this.processor.resetStability();
    this.currentPhase = `${this.currentEndpoint}-ready`;
    this.render({
      noiseFloorRms,
      calibrationRemainingMs: null,
      statusMessage: `Room check complete. Get ready to sing your ${this.currentEndpoint} note.`,
    });
  }

  private processCaptureFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): void {
    this.activeCapture ??= this.createCapture({ startedAtMs: timestampMs });
    const observation = this.processor.processFrame(frame, sampleRate, timestampMs);
    const outcome = this.activeCapture.update(observation);
    if (outcome.state === "collecting") {
      this.updateSnapshot({
        captureElapsedMs: outcome.elapsedMs,
        stableDurationMs: outcome.stableDurationMs,
        statusMessage: liveStatus(observation, outcome.rejectReason),
      });
      return;
    }
    if (outcome.state === "rejected") {
      this.analytics.track("capture_rejected");
      this.activeCapture = null;
      this.currentPhase = "recoverable-error";
      this.render({
        statusMessage: "That capture wasn’t accepted.",
        errorMessage: failureMessageFor(outcome.reason),
        recoveryAction: "retry-capture",
        stableLocked: false,
      });
      return;
    }

    if (!this.currentEndpoint) throw new Error("Missing endpoint for successful capture");
    this.analytics.track("capture_succeeded");
    if (this.currentEndpoint === "lowest") this.lowest = outcome.endpoint;
    else this.highest = outcome.endpoint;
    this.activeCapture = null;
    this.currentPhase = `${this.currentEndpoint}-success`;
    this.render({
      statusMessage: `Stable note captured: ${outcome.endpoint.note}.`,
      errorMessage: null,
      recoveryAction: null,
      stableLocked: true,
      captureElapsedMs: null,
      stableDurationMs: 0,
    });
  }

  private async finishResult(): Promise<void> {
    if (!this.lowest || !this.highest) throw new Error("Both endpoints are required for a result");
    const calculation = calculateRange(this.lowest, this.highest);
    if (!calculation.ok) {
      this.currentEndpoint = "highest";
      this.currentPhase = "recoverable-error";
      this.render({
        statusMessage: "The captured high note was not above the low note.",
        errorMessage: "Retest your highest note with a comfortable pitch above your lowest note.",
        recoveryAction: "retry-capture",
        stableLocked: false,
      });
      return;
    }
    this.result = calculation;
    this.overlaps = calculateRangeOverlap(calculation.lowest.midi, calculation.highest.midi);
    this.currentPhase = "result";
    this.currentEndpoint = null;
    this.retestTarget = null;
    await this.stopMicrophone();
    this.analytics.track("result_viewed");
    this.render({
      statusMessage: "Your vocal range is ready.",
      result: this.result,
      overlaps: this.overlaps,
      stableLocked: false,
    });
  }

  private async stopMicrophone(): Promise<void> {
    this.microphoneGeneration += 1;
    const microphone = this.microphone;
    this.microphone = null;
    if (microphone) await microphone.stop();
  }

  private render(patch: Partial<VocalRangeTestSnapshot> = {}): void {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      phase: this.currentPhase,
      activeEndpoint: this.currentEndpoint,
      lowest: this.lowest,
      highest: this.highest,
      result: this.result,
      overlaps: this.overlaps,
    };
    this.view.render({ ...this.snapshot, overlaps: [...this.snapshot.overlaps] });
  }

  private updateSnapshot(patch: Partial<VocalRangeTestSnapshot>): void {
    this.render(patch);
  }
}

function initialSnapshot(): VocalRangeTestSnapshot {
  return {
    phase: "intro",
    activeEndpoint: null,
    calibrationRemainingMs: null,
    captureElapsedMs: null,
    stableDurationMs: 0,
    statusMessage: "Ready to start.",
    errorMessage: null,
    recoveryAction: null,
    lowest: null,
    highest: null,
    result: null,
    overlaps: [],
    noiseFloorRms: null,
    stableLocked: false,
  };
}

function liveStatus(observation: PitchFrameObservation, reason: string | null): string {
  if (observation.stable.state === "stable") return "Stable pitch found. Keep holding it steady…";
  if (reason) return failureMessageFor(reason);
  return "Listening for a steady note…";
}

function microphoneErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/denied|permission|notallowed/i.test(message)) {
    return "Microphone access is needed for this test. Allow access in your browser settings and try again.";
  }
  return "Your microphone could not be opened. Check your browser settings and try again.";
}
