import type { MicrophoneFrameInfo } from "../audio/MicrophoneController";
import type { ABObservation, ABRunner } from "../dsp/ABRunner";
import { createSessionExport, type ValidationSessionExport } from "../export/SessionExporter";
import { analyzeAttempt } from "./AttemptAnalyzer";
import { ValidationSession } from "./ValidationSession";
import type {
  AttemptResult,
  CalibrationSummary,
  DeviceEnvironment,
  EndpointType,
  PhonationTag,
  ValidationPhase,
  ValidationSessionSummary,
} from "./types";

const WINDOW_MS = 3000;

export interface MicrophonePort {
  start(): Promise<MicrophoneFrameInfo>;
  stop(): Promise<void>;
}

export interface ValidationFlowSnapshot {
  phase: ValidationPhase;
  endpoint: EndpointType;
  remainingMs: number | null;
  lowestSuccesses: number;
  highestSuccesses: number;
  requiredPerEndpoint: 3;
  retryCount: number;
}

export interface ValidationHarnessViewPort {
  renderFlow(snapshot: ValidationFlowSnapshot): void;
  renderObservation(observation: ABObservation): void;
  renderAttempt(attempt: AttemptResult): void;
  renderSummary(summary: ValidationSessionSummary): void;
  renderEnvironment(environment: DeviceEnvironment, info: MicrophoneFrameInfo): void;
  setStatus(message: string): void;
}

export interface ValidationHarnessControllerOptions {
  runner: ABRunner;
  environment: DeviceEnvironment;
  view: ValidationHarnessViewPort;
  createMicrophone: (
    onFrame: (frame: Float32Array, sampleRate: number, timestampMs: number) => void,
  ) => MicrophonePort;
  createSessionId?: () => string;
  createdAt?: () => string;
}

export class ValidationHarnessController {
  private readonly runner: ABRunner;
  private readonly environment: DeviceEnvironment;
  private readonly view: ValidationHarnessViewPort;
  private readonly createMicrophone: ValidationHarnessControllerOptions["createMicrophone"];
  private readonly createSessionId: () => string;
  private readonly createdAt: () => string;

  private currentPhase: ValidationPhase = "setup";
  private microphone: MicrophonePort | null = null;
  private currentSession: ValidationSession | null = null;
  private calibrationSummary: CalibrationSummary | null = null;
  private calibrationStartedAtMs: number | null = null;
  private calibrationFrameCount = 0;
  private activeAttemptStartedAtMs: number | null = null;
  private activeAttemptFrames: ABObservation[] = [];
  private activeTags: PhonationTag[] = [];
  private lastTimestampMs: number | null = null;

  constructor(options: ValidationHarnessControllerOptions) {
    this.runner = options.runner;
    this.environment = options.environment;
    this.view = options.view;
    this.createMicrophone = options.createMicrophone;
    this.createSessionId = options.createSessionId ?? (() => crypto.randomUUID());
    this.createdAt = options.createdAt ?? (() => new Date().toISOString());
    this.renderFlow();
  }

  get phase(): ValidationPhase {
    return this.currentPhase;
  }

  get session(): ValidationSession | null {
    return this.currentSession;
  }

  get calibration(): CalibrationSummary | null {
    return this.calibrationSummary;
  }

  async startSession(testerId: string): Promise<void> {
    const normalizedTesterId = testerId.trim();
    if (!normalizedTesterId) throw new Error("Anonymous tester ID is required");
    if (!["setup", "stopped", "error"].includes(this.currentPhase)) {
      throw new Error("A validation session is already active");
    }

    this.runner.reset();
    this.runner.beginNoiseCalibration();
    this.calibrationSummary = null;
    this.calibrationStartedAtMs = null;
    this.calibrationFrameCount = 0;
    this.activeAttemptStartedAtMs = null;
    this.activeAttemptFrames = [];
    this.lastTimestampMs = null;
    this.currentSession = null;
    this.setPhase("requesting-permission");
    this.view.setStatus("Requesting microphone permission…");

    const microphone = this.createMicrophone((frame, sampleRate, timestampMs) =>
      this.processFrame(frame, sampleRate, timestampMs),
    );
    this.microphone = microphone;

    try {
      const info = await microphone.start();
      this.currentSession = new ValidationSession({
        sessionId: this.createSessionId(),
        testerId: normalizedTesterId,
        createdAt: this.createdAt(),
        environment: this.environment,
        sampleRate: info.sampleRate,
        frameSize: 4096,
        cadenceHz: 20,
        trackSettings: info.trackSettings ? { ...info.trackSettings } : null,
        simulated: false,
      });
      this.view.renderEnvironment(this.environment, info);
      this.setPhase("calibrating");
      this.view.setStatus("Stay quiet for 3 seconds while the room noise floor is measured.");
    } catch (error) {
      this.microphone = null;
      this.currentSession = null;
      this.setPhase("error");
      this.view.setStatus(`Microphone error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  startAttempt(tags: readonly PhonationTag[]): void {
    if (this.currentPhase !== "ready" || !this.currentSession) {
      throw new Error("Wait for calibration or the current attempt to finish");
    }
    this.runner.resetStability();
    this.activeAttemptStartedAtMs = null;
    this.activeAttemptFrames = [];
    this.activeTags = [...tags];
    this.setPhase("attempting");
    this.view.setStatus(
      `Sing your ${this.currentSession.currentEndpoint} comfortable stable note for about 3 seconds.`,
    );
  }

  async stopSession(): Promise<void> {
    if (this.currentPhase === "attempting" && this.activeAttemptStartedAtMs !== null) {
      this.finalizeAttempt(false, this.lastTimestampMs ?? this.activeAttemptStartedAtMs);
    }
    await this.stopMicrophone();
    if (this.currentSession) this.view.renderSummary(this.currentSession.buildSummary());
    this.setPhase(this.currentSession?.isComplete ? "summary" : "stopped");
    this.view.setStatus(this.currentSession?.isComplete
      ? "Session complete. Export the JSON and copy the text summary."
      : "Session stopped before all six successful endpoint captures were collected.");
  }

  async handleVisibilityHidden(): Promise<void> {
    this.view.setStatus("Capture stopped because the page was hidden.");
    await this.stopSession();
  }

  buildReport(): ValidationSessionExport | null {
    if (!this.currentSession || !this.calibrationSummary) return null;
    return createSessionExport(this.currentSession, this.calibrationSummary);
  }

  private processFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): void {
    this.lastTimestampMs = timestampMs;
    if (this.currentPhase === "calibrating") {
      this.processCalibrationFrame(frame, sampleRate, timestampMs);
      return;
    }
    if (this.currentPhase === "attempting") {
      this.processAttemptFrame(frame, sampleRate, timestampMs);
      return;
    }
    if (this.currentPhase === "ready") {
      this.view.renderObservation(this.runner.processFrame(frame, sampleRate, timestampMs));
    }
  }

  private processCalibrationFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): void {
    if (this.calibrationStartedAtMs === null) this.calibrationStartedAtMs = timestampMs;
    const observation = this.runner.processFrame(frame, sampleRate, timestampMs, true);
    this.calibrationFrameCount += 1;
    this.view.renderObservation(observation);
    this.renderFlow(Math.max(0, WINDOW_MS - (timestampMs - this.calibrationStartedAtMs)));

    if (timestampMs - this.calibrationStartedAtMs >= WINDOW_MS) {
      const noiseFloorRms = this.runner.finishNoiseCalibration();
      this.calibrationSummary = {
        durationMs: WINDOW_MS,
        frameCount: this.calibrationFrameCount,
        noiseFloorRms,
        sampleRate,
      };
      this.runner.resetStability();
      this.setPhase("ready");
      this.view.setStatus("Calibration complete. Prepare your lowest comfortable note.");
    }
  }

  private processAttemptFrame(
    frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): void {
    if (this.activeAttemptStartedAtMs === null) this.activeAttemptStartedAtMs = timestampMs;
    const observation = this.runner.processFrame(frame, sampleRate, timestampMs);
    this.activeAttemptFrames.push(observation);
    this.view.renderObservation(observation);
    this.renderFlow(Math.max(0, WINDOW_MS - (timestampMs - this.activeAttemptStartedAtMs)));

    if (timestampMs - this.activeAttemptStartedAtMs >= WINDOW_MS) {
      this.finalizeAttempt(true, this.activeAttemptStartedAtMs + WINDOW_MS);
    }
  }

  private finalizeAttempt(completed: boolean, endedAtMs: number): void {
    const session = this.currentSession;
    const startedAtMs = this.activeAttemptStartedAtMs;
    if (!session || startedAtMs === null) return;
    const attempt = analyzeAttempt({
      observations: this.activeAttemptFrames,
      startedAtMs,
      endedAtMs,
      completed,
      endpoint: session.currentEndpoint,
      endpointAttemptNumber: session.nextEndpointAttemptNumber(),
      tags: this.activeTags,
      context: session.context,
    });
    session.addAttempt(attempt);
    this.view.renderAttempt(attempt);
    this.view.renderSummary(session.buildSummary());
    this.activeAttemptStartedAtMs = null;
    this.activeAttemptFrames = [];
    this.activeTags = [];

    if (session.isComplete) {
      this.setPhase("summary");
      this.view.setStatus("Session complete. Export the JSON and copy the text summary.");
      void this.stopMicrophone();
    } else {
      this.setPhase("ready");
      this.view.setStatus(attempt.pitchy.success
        ? `Captured. Prepare the next ${session.currentEndpoint} attempt.`
        : `No stable Pitchy capture. Retry the ${session.currentEndpoint} attempt.`);
    }
  }

  private setPhase(phase: ValidationPhase): void {
    this.currentPhase = phase;
    this.renderFlow();
  }

  private renderFlow(remainingMs: number | null = null): void {
    this.view.renderFlow({
      phase: this.currentPhase,
      endpoint: this.currentSession?.currentEndpoint ?? "lowest",
      remainingMs,
      lowestSuccesses: this.currentSession?.successfulCount("lowest") ?? 0,
      highestSuccesses: this.currentSession?.successfulCount("highest") ?? 0,
      requiredPerEndpoint: 3,
      retryCount: this.currentSession?.retryCount ?? 0,
    });
  }

  private async stopMicrophone(): Promise<void> {
    const microphone = this.microphone;
    this.microphone = null;
    if (microphone) await microphone.stop();
  }
}
