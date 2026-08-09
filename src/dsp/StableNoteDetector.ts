import type { SignalQuality } from "./SignalQualityEvaluator";
import type { PitchEstimate } from "./types";

export type StableState = "idle" | "collecting" | "stable" | "rejected";

export interface StableInput {
  timestampMs: number;
  estimate: PitchEstimate | null;
  quality: SignalQuality;
}

export interface StableStatus {
  state: StableState;
  frequencyHz: number | null;
  stableDurationMs: number;
  rejectReason: string | null;
  usableRatio: number;
  centsMad: number | null;
  centsSpread: number | null;
  driftCents: number | null;
}

export interface StableNoteOptions {
  windowMs?: number;
  minimumStableMs?: number;
  minimumUsableRatio?: number;
  minimumConfidence?: number;
  maximumMadCents?: number;
  maximumSpreadCents?: number;
  maximumDriftCents?: number;
  maximumOctaveTransitionRatio?: number;
  maximumUnusableGapMs?: number;
}

interface TrackedFrame {
  timestampMs: number;
  usable: boolean;
  frequencyHz: number | null;
  rejectReason: string | null;
}

const EMPTY_STATUS: StableStatus = {
  state: "idle",
  frequencyHz: null,
  stableDurationMs: 0,
  rejectReason: null,
  usableRatio: 0,
  centsMad: null,
  centsSpread: null,
  driftCents: null,
};

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function frequencyToCents(frequencyHz: number): number {
  return 1200 * Math.log2(frequencyHz / 440);
}

export class StableNoteDetector {
  private readonly windowMs: number;
  private readonly minimumStableMs: number;
  private readonly minimumUsableRatio: number;
  private readonly minimumConfidence: number;
  private readonly maximumMadCents: number;
  private readonly maximumSpreadCents: number;
  private readonly maximumDriftCents: number;
  private readonly maximumOctaveTransitionRatio: number;
  private readonly maximumUnusableGapMs: number;
  private frames: TrackedFrame[] = [];
  private status: StableStatus = { ...EMPTY_STATUS };
  private hasReachedStable = false;

  constructor(options: StableNoteOptions = {}) {
    this.windowMs = options.windowMs ?? 800;
    this.minimumStableMs = options.minimumStableMs ?? 600;
    this.minimumUsableRatio = options.minimumUsableRatio ?? 0.75;
    this.minimumConfidence = options.minimumConfidence ?? 0.75;
    this.maximumMadCents = options.maximumMadCents ?? 30;
    this.maximumSpreadCents = options.maximumSpreadCents ?? 100;
    this.maximumDriftCents = options.maximumDriftCents ?? 35;
    this.maximumOctaveTransitionRatio = options.maximumOctaveTransitionRatio ?? 0.1;
    this.maximumUnusableGapMs = options.maximumUnusableGapMs ?? 150;
  }

  get current(): StableStatus {
    return this.status;
  }

  reset(): void {
    this.frames = [];
    this.status = { ...EMPTY_STATUS };
    this.hasReachedStable = false;
  }

  update(input: StableInput): StableStatus {
    const usable =
      input.quality.state === "usable" &&
      input.estimate !== null &&
      input.estimate.confidence >= this.minimumConfidence &&
      Number.isFinite(input.estimate.frequencyHz) &&
      input.estimate.frequencyHz > 0;
    const rejectReason = input.quality.rejectReason ??
      (input.estimate === null ? "no-pitch" :
        input.estimate.confidence < this.minimumConfidence ? "low-confidence" : null);

    this.frames.push({
      timestampMs: input.timestampMs,
      usable,
      frequencyHz: usable ? input.estimate!.frequencyHz : null,
      rejectReason,
    });
    const cutoff = input.timestampMs - this.windowMs;
    this.frames = this.frames.filter((frame) => frame.timestampMs >= cutoff);
    this.status = this.calculateStatus();
    if (this.status.state === "stable") this.hasReachedStable = true;
    return this.status;
  }

  private calculateStatus(): StableStatus {
    if (this.frames.length === 0) return { ...EMPTY_STATUS };
    const valid = this.frames.filter(
      (frame): frame is TrackedFrame & { frequencyHz: number } =>
        frame.usable && frame.frequencyHz !== null,
    );
    const windowDuration = this.frames.at(-1)!.timestampMs - this.frames[0].timestampMs;
    const usableRatio = valid.length / this.frames.length;
    const stableDurationMs = valid.length > 1
      ? valid.at(-1)!.timestampMs - valid[0].timestampMs
      : 0;
    const latestFrame = this.frames.at(-1)!;
    const lastUsableAtMs = valid.at(-1)?.timestampMs ?? this.frames[0].timestampMs;
    if (
      this.hasReachedStable &&
      !latestFrame.usable &&
      latestFrame.timestampMs - lastUsableAtMs >= this.maximumUnusableGapMs
    ) {
      return this.rejectedStatus(
        stableDurationMs,
        usableRatio,
        latestFrame.rejectReason ?? "signal-lost",
      );
    }

    if (windowDuration < this.minimumStableMs) {
      return {
        ...EMPTY_STATUS,
        state: "collecting",
        stableDurationMs,
        usableRatio,
        rejectReason: this.frames.at(-1)!.rejectReason,
      };
    }
    if (usableRatio < this.minimumUsableRatio || valid.length < 4) {
      return {
        ...EMPTY_STATUS,
        state: "rejected",
        stableDurationMs,
        usableRatio,
        rejectReason: "insufficient-usable-frames",
      };
    }

    const cents = valid.map((frame) => frequencyToCents(frame.frequencyHz));
    let octaveTransitions = 0;
    for (let index = 1; index < cents.length; index += 1) {
      const distance = Math.abs(cents[index] - cents[index - 1]);
      if (distance >= 1_100 && distance <= 1_300) octaveTransitions += 1;
    }
    const octaveTransitionRatio = octaveTransitions / Math.max(1, cents.length - 1);
    if (octaveTransitionRatio > this.maximumOctaveTransitionRatio) {
      return this.rejectedStatus(
        stableDurationMs,
        usableRatio,
        "octave-ambiguous",
      );
    }

    const middle = Math.floor(cents.length / 2);
    const firstMedian = median(cents.slice(0, middle));
    const secondMedian = median(cents.slice(middle));
    const driftCents = Math.abs(secondMedian - firstMedian);
    if (driftCents > this.maximumDriftCents) {
      return this.rejectedStatus(
        stableDurationMs,
        usableRatio,
        "pitch-drift",
        null,
        null,
        driftCents,
      );
    }

    const centerCents = median(cents);
    const centsMad = median(cents.map((value) => Math.abs(value - centerCents)));
    const centsSpread = percentile(cents, 0.9) - percentile(cents, 0.1);
    if (centsMad > this.maximumMadCents || centsSpread > this.maximumSpreadCents + 1e-6) {
      return this.rejectedStatus(
        stableDurationMs,
        usableRatio,
        "pitch-spread",
        centsMad,
        centsSpread,
        driftCents,
      );
    }

    return {
      state: "stable",
      frequencyHz: 440 * 2 ** (centerCents / 1200),
      stableDurationMs,
      rejectReason: null,
      usableRatio,
      centsMad,
      centsSpread,
      driftCents,
    };
  }

  private rejectedStatus(
    stableDurationMs: number,
    usableRatio: number,
    rejectReason: string,
    centsMad: number | null = null,
    centsSpread: number | null = null,
    driftCents: number | null = null,
  ): StableStatus {
    return {
      state: "rejected",
      frequencyHz: null,
      stableDurationMs,
      rejectReason,
      usableRatio,
      centsMad,
      centsSpread,
      driftCents,
    };
  }
}
