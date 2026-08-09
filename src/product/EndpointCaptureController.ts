import { percentile } from "../benchmark/metrics";
import { mapFrequencyToNote } from "../dsp/NoteMapper";
import type { PitchFrameObservation } from "./PitchFrameProcessor";
import { PRODUCT_AUDIO_CONFIG } from "./ProductConfig";
import type { CapturedEndpoint } from "./types";

export type EndpointCaptureStatus =
  | {
    state: "collecting";
    elapsedMs: number;
    stableDurationMs: number;
    rejectReason: string | null;
  }
  | {
    state: "success";
    endpoint: CapturedEndpoint;
    stableLatencyMs: number;
    processingTimeP50Ms: number;
    processingTimeP95Ms: number;
  }
  | { state: "rejected"; reason: string };

export interface EndpointCaptureOptions {
  startedAtMs: number;
  attemptTimeoutMs?: number;
  tailConfirmationMs?: number;
  minimumTerminalStableRatio?: number;
}

export class EndpointCaptureController {
  private readonly startedAtMs: number;
  private readonly attemptTimeoutMs: number;
  private readonly tailConfirmationMs: number;
  private readonly minimumTerminalStableRatio: number;
  private readonly observations: PitchFrameObservation[] = [];
  private readonly rejectReasons: string[] = [];
  private lockedAtMs: number | null = null;
  private terminal: EndpointCaptureStatus | null = null;

  constructor(options: EndpointCaptureOptions) {
    this.startedAtMs = options.startedAtMs;
    this.attemptTimeoutMs = options.attemptTimeoutMs ?? PRODUCT_AUDIO_CONFIG.attemptTimeoutMs;
    this.tailConfirmationMs = options.tailConfirmationMs ?? PRODUCT_AUDIO_CONFIG.tailConfirmationMs;
    this.minimumTerminalStableRatio = options.minimumTerminalStableRatio ?? 0.75;
  }

  update(observation: PitchFrameObservation): EndpointCaptureStatus {
    if (this.terminal) return this.terminal;
    this.observations.push(observation);
    const reason = observation.stable.rejectReason ?? observation.signal.rejectReason;
    if (reason) this.rejectReasons.push(reason);

    if (reason === "octave-ambiguous") return this.reject("octave-ambiguous");
    if (this.lockedAtMs !== null && reason === "pitch-drift") {
      return this.reject("post-lock-drift");
    }
    if (
      this.lockedAtMs !== null &&
      observation.stable.state === "rejected" &&
      ["silence", "signal-too-quiet", "snr-below-threshold", "no-pitch", "low-confidence"]
        .includes(reason ?? "")
    ) {
      return this.reject("insufficient-terminal-stability");
    }

    if (isStable(observation) && this.lockedAtMs === null) {
      this.lockedAtMs = observation.timestampMs;
    }

    if (
      this.lockedAtMs !== null &&
      observation.timestampMs - this.lockedAtMs >= this.tailConfirmationMs
    ) {
      const terminalStart = observation.timestampMs - this.tailConfirmationMs;
      const terminalFrames = this.observations.filter((item) => item.timestampMs >= terminalStart);
      const terminalStable = terminalFrames.filter(isStable);
      const stableRatio = terminalFrames.length === 0 ? 0 : terminalStable.length / terminalFrames.length;
      if (stableRatio >= this.minimumTerminalStableRatio && isStable(observation)) {
        return this.succeed();
      }
    }

    const elapsedMs = Math.max(0, observation.timestampMs - this.startedAtMs);
    if (elapsedMs >= this.attemptTimeoutMs) {
      return this.reject(this.rejectReasons.at(-1) ?? "capture-timeout");
    }

    return {
      state: "collecting",
      elapsedMs,
      stableDurationMs: observation.stable.stableDurationMs,
      rejectReason: reason,
    };
  }

  private succeed(): EndpointCaptureStatus {
    const stable = this.observations.filter(isStable);
    const frequencyHz = logMedian(stable.map((item) => item.stable.frequencyHz!));
    const mapping = mapFrequencyToNote(frequencyHz);
    if (!mapping || this.lockedAtMs === null) return this.reject("no-pitch");
    const times = this.observations.map((item) => item.processingTimeMs);
    this.terminal = {
      state: "success",
      endpoint: mapping,
      stableLatencyMs: Math.max(0, this.lockedAtMs - this.startedAtMs),
      processingTimeP50Ms: percentile(times, 0.5),
      processingTimeP95Ms: percentile(times, 0.95),
    };
    return this.terminal;
  }

  private reject(reason: string): EndpointCaptureStatus {
    this.terminal = { state: "rejected", reason };
    return this.terminal;
  }
}

function isStable(observation: PitchFrameObservation): boolean {
  return observation.signal.state === "usable" &&
    observation.stable.state === "stable" &&
    observation.stable.frequencyHz !== null &&
    Number.isFinite(observation.stable.frequencyHz);
}

function logMedian(values: readonly number[]): number {
  const logs = values.map(Math.log2).sort((left, right) => left - right);
  const middle = Math.floor(logs.length / 2);
  const center = logs.length % 2 === 0
    ? (logs[middle - 1] + logs[middle]) / 2
    : logs[middle];
  return 2 ** center;
}

