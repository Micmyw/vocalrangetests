import { describe, expect, it, vi } from "vitest";
import type { MicrophoneFrameInfo } from "../audio/MicrophoneController";
import { ABRunner } from "../dsp/ABRunner";
import type { PitchDetectorAdapter, PitchEstimate } from "../dsp/types";
import { ValidationHarnessController, type ValidationHarnessViewPort } from "./ValidationHarnessController";
import type { DeviceEnvironment } from "./types";

const environment: DeviceEnvironment = {
  os: "Windows",
  browser: "Chrome 138",
  device: "Desktop",
  userAgent: "test-agent",
};

describe("ValidationHarnessController", () => {
  it("runs 3000 ms calibration and fixed attempts until three successes per endpoint", async () => {
    const harness = setupHarness();
    await harness.controller.startSession("T01");

    expect(harness.controller.phase).toBe("calibrating");
    harness.emit(noiseFrame(), 0);
    harness.emit(noiseFrame(), 1500);
    harness.emit(noiseFrame(), 3000);
    expect(harness.controller.phase).toBe("ready");
    expect(harness.controller.calibration).toMatchObject({ durationMs: 3000, frameCount: 3 });

    harness.controller.startAttempt(["fry"]);
    emitWindow(harness.emit, silenceFrame(), 4000);
    expect(harness.controller.session?.retryCount).toBe(1);
    expect(harness.controller.session?.currentEndpoint).toBe("lowest");

    for (const start of [8000, 12_000, 16_000]) {
      harness.controller.startAttempt(["modal"]);
      emitWindow(harness.emit, toneFrame(110), start);
    }
    expect(harness.controller.session?.currentEndpoint).toBe("highest");
    expect(harness.controller.session?.successfulCount("lowest")).toBe(3);

    harness.pitchy.frequencyHz = 440;
    harness.yin.frequencyHz = 440.1;
    for (const start of [20_000, 24_000, 28_000]) {
      harness.controller.startAttempt(["head-falsetto"]);
      emitWindow(harness.emit, toneFrame(440), start);
    }
    await Promise.resolve();

    expect(harness.controller.phase).toBe("summary");
    expect(harness.controller.session?.isComplete).toBe(true);
    expect(harness.view.attempts).toHaveLength(7);
    expect(harness.microphone.stop).toHaveBeenCalledOnce();
    expect(harness.view.summaries.at(-1)?.endpoints.lowest.repeatableWithinOneSemitone).toBe(true);
    expect(harness.view.summaries.at(-1)?.endpoints.highest.repeatableWithinOneSemitone).toBe(true);
  });

  it("records a hidden-page active attempt as incomplete and stops capture", async () => {
    const harness = setupHarness();
    await harness.controller.startSession("T02");
    harness.emit(noiseFrame(), 0);
    harness.emit(noiseFrame(), 3000);
    harness.controller.startAttempt(["breathy"]);
    harness.emit(toneFrame(110), 4000);
    harness.emit(toneFrame(110), 4500);

    await harness.controller.handleVisibilityHidden();

    expect(harness.controller.phase).toBe("stopped");
    expect(harness.controller.session?.attempts).toHaveLength(1);
    expect(harness.controller.session?.attempts[0].completed).toBe(false);
    expect(harness.controller.session?.retryCount).toBe(0);
    expect(harness.microphone.stop).toHaveBeenCalledOnce();
  });

  it("exposes permission errors as a recoverable error state", async () => {
    const view = new RecordingView();
    const controller = new ValidationHarnessController({
      runner: createRunner(new MutableDetector("pitchy", 110), new MutableDetector("yin", 110)),
      environment,
      view,
      createMicrophone: () => ({
        start: async () => { throw new Error("Permission denied"); },
        stop: async () => undefined,
      }),
      createSessionId: () => "session-error",
      createdAt: () => "2026-08-09T08:00:00.000Z",
    });

    await expect(controller.startSession("T03")).rejects.toThrow("Permission denied");
    expect(controller.phase).toBe("error");
    expect(view.statuses.at(-1)).toContain("Permission denied");
  });
});

function setupHarness() {
  const pitchy = new MutableDetector("pitchy", 110);
  const yin = new MutableDetector("yin", 110.1);
  const runner = createRunner(pitchy, yin);
  const view = new RecordingView();
  let callback: ((frame: Float32Array, sampleRate: number, timestampMs: number) => void) | null = null;
  const microphone = {
    start: vi.fn(async (): Promise<MicrophoneFrameInfo> => ({
      sampleRate: 48_000,
      frameSize: 4096,
      intervalMs: 50,
      trackSettings: { sampleRate: 48_000, channelCount: 1 },
    })),
    stop: vi.fn(async () => undefined),
  };
  const controller = new ValidationHarnessController({
    runner,
    environment,
    view,
    createMicrophone: (onFrame) => {
      callback = onFrame;
      return microphone;
    },
    createSessionId: () => "session-1",
    createdAt: () => "2026-08-09T08:00:00.000Z",
  });
  return {
    controller,
    pitchy,
    yin,
    view,
    microphone,
    emit: (frame: Float32Array, timestampMs: number) => callback!(frame, 48_000, timestampMs),
  };
}

function createRunner(pitchy: MutableDetector, yin: MutableDetector): ABRunner {
  return new ABRunner({ pitchy, yin, now: (() => {
    let value = 0;
    return () => value += 0.1;
  })() });
}

class MutableDetector implements PitchDetectorAdapter {
  readonly frameSize = 4096;

  constructor(
    readonly id: "pitchy" | "yin",
    public frequencyHz: number,
  ) {}

  detect(frame: Float32Array): PitchEstimate | null {
    let squareSum = 0;
    for (const sample of frame) squareSum += sample * sample;
    if (Math.sqrt(squareSum / frame.length) < 0.01) return null;
    return { frequencyHz: this.frequencyHz, confidence: 0.98 };
  }
}

class RecordingView implements ValidationHarnessViewPort {
  flows: Parameters<ValidationHarnessViewPort["renderFlow"]>[0][] = [];
  attempts: Parameters<ValidationHarnessViewPort["renderAttempt"]>[0][] = [];
  summaries: Parameters<ValidationHarnessViewPort["renderSummary"]>[0][] = [];
  statuses: string[] = [];

  renderFlow(snapshot: Parameters<ValidationHarnessViewPort["renderFlow"]>[0]): void {
    this.flows.push(snapshot);
  }
  renderObservation(): void {}
  renderAttempt(attempt: Parameters<ValidationHarnessViewPort["renderAttempt"]>[0]): void {
    this.attempts.push(attempt);
  }
  renderSummary(summary: Parameters<ValidationHarnessViewPort["renderSummary"]>[0]): void {
    this.summaries.push(summary);
  }
  renderEnvironment(): void {}
  setStatus(message: string): void { this.statuses.push(message); }
}

function emitWindow(
  emit: (frame: Float32Array, timestampMs: number) => void,
  frame: Float32Array,
  startedAtMs: number,
): void {
  for (let elapsed = 0; elapsed <= 3000; elapsed += 50) emit(frame, startedAtMs + elapsed);
}

function toneFrame(frequencyHz: number): Float32Array {
  return Float32Array.from(
    { length: 4096 },
    (_, index) => 0.1 * Math.sin((2 * Math.PI * frequencyHz * index) / 48_000),
  );
}

function noiseFrame(): Float32Array {
  return new Float32Array(4096).fill(0.001);
}

function silenceFrame(): Float32Array {
  return new Float32Array(4096);
}
