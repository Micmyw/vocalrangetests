import { describe, expect, it, vi } from "vitest";
import type { MicrophoneFrameInfo } from "../audio/MicrophoneController";
import type { SignalQuality } from "../dsp/SignalQualityEvaluator";
import type { EndpointCaptureStatus } from "./EndpointCaptureController";
import type { PitchFrameObservation } from "./PitchFrameProcessor";
import type { CapturedEndpoint } from "./types";
import type { AnalyticsEvent } from "./analytics";
import {
  VocalRangeTestController,
  type VocalRangeTestSnapshot,
  type VocalRangeTestViewPort,
} from "./VocalRangeTestController";

describe("VocalRangeTestController", () => {
  it("runs calibration and one successful capture per endpoint", async () => {
    const harness = setupHarness([success(220, 57, "A3"), success(440, 69, "A4")]);

    await harness.controller.startTest();
    expect(harness.controller.phase).toBe("calibrating");
    harness.emit(0);
    harness.emit(3_000);
    expect(harness.controller.phase).toBe("lowest-ready");

    harness.controller.startCapture();
    harness.emit(3_050);
    expect(harness.controller.phase).toBe("lowest-success");
    await harness.controller.continueAfterSuccess();
    expect(harness.controller.phase).toBe("highest-ready");

    harness.controller.startCapture();
    harness.emit(3_100);
    expect(harness.controller.phase).toBe("highest-success");
    await harness.controller.continueAfterSuccess();

    expect(harness.controller.phase).toBe("result");
    expect(harness.view.latest.result).toMatchObject({ semitoneSpan: 12, octaveSpan: 1 });
    expect(harness.microphones[0].stop).toHaveBeenCalledOnce();
    expect(harness.analytics.track.mock.calls.map(([event]) => event)).toEqual([
      "test_started",
      "microphone_ready",
      "calibration_completed",
      "capture_succeeded",
      "capture_succeeded",
      "result_viewed",
    ]);
  });

  it("shows a failed capture and waits for an explicit retry", async () => {
    const createCapture = vi.fn()
      .mockReturnValueOnce({ update: () => ({ state: "rejected", reason: "input-clipping" }) })
      .mockReturnValueOnce({ update: () => success(220, 57, "A3") });
    const harness = setupHarness([], createCapture);
    await harness.controller.startTest();
    harness.emit(0);
    harness.emit(3_000);

    harness.controller.startCapture();
    harness.emit(3_050);
    expect(harness.controller.phase).toBe("recoverable-error");
    expect(harness.view.latest).toMatchObject({
      recoveryAction: "retry-capture",
      errorMessage: expect.stringContaining("too loud"),
    });
    expect(createCapture).toHaveBeenCalledTimes(1);

    harness.controller.retryCapture();
    expect(createCapture).toHaveBeenCalledTimes(1);
    harness.emit(3_100);
    expect(createCapture).toHaveBeenCalledTimes(2);
    expect(harness.controller.phase).toBe("lowest-success");
  });

  it("stops and discards capture when hidden, then recalibrates before continuing", async () => {
    const harness = setupHarness([success(220, 57, "A3")]);
    await harness.controller.startTest();
    harness.emit(0);
    harness.emit(3_000);
    harness.controller.startCapture();

    await harness.controller.handleHidden();

    expect(harness.controller.phase).toBe("recoverable-error");
    expect(harness.view.latest.recoveryAction).toBe("reopen-microphone");
    expect(harness.microphones[0].stop).toHaveBeenCalledOnce();

    await harness.controller.reopenMicrophone();
    expect(harness.controller.phase).toBe("calibrating");
    harness.emit(4_000);
    harness.emit(7_000);
    expect(harness.controller.phase).toBe("lowest-ready");
  });

  it("reopens the microphone and recalibrates for an endpoint retest", async () => {
    const harness = setupHarness([
      success(220, 57, "A3"),
      success(440, 69, "A4"),
      success(196, 55, "G3"),
    ]);
    await completeTest(harness);

    await harness.controller.retestEndpoint("lowest");
    expect(harness.controller.phase).toBe("calibrating");
    expect(harness.microphones).toHaveLength(2);
    harness.emit(4_000);
    harness.emit(7_000);
    expect(harness.controller.phase).toBe("lowest-ready");
    harness.controller.startCapture();
    harness.emit(7_050);
    await harness.controller.continueAfterSuccess();

    expect(harness.controller.phase).toBe("result");
    expect(harness.view.latest.result?.lowest.note).toBe("G3");
    expect(harness.view.latest.result?.highest.note).toBe("A4");
  });
});

async function completeTest(harness: ReturnType<typeof setupHarness>): Promise<void> {
  await harness.controller.startTest();
  harness.emit(0);
  harness.emit(3_000);
  harness.controller.startCapture();
  harness.emit(3_050);
  await harness.controller.continueAfterSuccess();
  harness.controller.startCapture();
  harness.emit(3_100);
  await harness.controller.continueAfterSuccess();
}

function setupHarness(
  outcomes: EndpointCaptureStatus[],
  createCapture = vi.fn(() => ({ update: () => outcomes.shift()! })),
) {
  const view = new RecordingView();
  const processor = new FakeProcessor();
  const microphones: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  const analytics = { track: vi.fn((_event: AnalyticsEvent) => true) };
  let callback: ((frame: Float32Array, sampleRate: number, timestampMs: number) => void) | null = null;
  const controller = new VocalRangeTestController({
    processor,
    view,
    createCapture,
    analytics,
    createMicrophone: (onFrame) => {
      callback = onFrame;
      const microphone = {
        start: vi.fn(async (): Promise<MicrophoneFrameInfo> => ({
          sampleRate: 48_000,
          frameSize: 4096,
          intervalMs: 50,
          trackSettings: { channelCount: 1, sampleRate: 48_000 },
        })),
        stop: vi.fn(async () => undefined),
      };
      microphones.push(microphone);
      return microphone;
    },
  });
  return {
    controller,
    view,
    microphones,
    analytics,
    emit: (timestampMs: number) => callback!(new Float32Array(4096).fill(0.1), 48_000, timestampMs),
  };
}

class FakeProcessor {
  beginNoiseCalibration(): void {}
  recordNoiseFrame(): SignalQuality { return quality(); }
  finishNoiseCalibration(): number { return 0.001; }
  resetStability(): void {}
  reset(): void {}
  processFrame(
    _frame: Float32Array,
    sampleRate: number,
    timestampMs: number,
  ): PitchFrameObservation {
    return {
      timestampMs,
      sampleRate,
      estimate: { frequencyHz: 220, confidence: 0.99 },
      note: null,
      signal: quality(),
      stable: {
        state: "stable",
        frequencyHz: 220,
        stableDurationMs: 800,
        rejectReason: null,
        usableRatio: 1,
        centsMad: 1,
        centsSpread: 2,
        driftCents: 0,
      },
      processingTimeMs: 1,
    };
  }
}

class RecordingView implements VocalRangeTestViewPort {
  readonly snapshots: VocalRangeTestSnapshot[] = [];
  get latest(): VocalRangeTestSnapshot { return this.snapshots.at(-1)!; }
  render(snapshot: VocalRangeTestSnapshot): void { this.snapshots.push(snapshot); }
}

function success(frequencyHz: number, midi: number, note: string): EndpointCaptureStatus {
  const endpoint: CapturedEndpoint = { frequencyHz, midi, note, cents: 0 };
  return {
    state: "success",
    endpoint,
    stableLatencyMs: 600,
    processingTimeP50Ms: 1,
    processingTimeP95Ms: 2,
  };
}

function quality(): SignalQuality {
  return {
    state: "usable",
    rms: 0.1,
    peak: 0.14,
    noiseFloorRms: 0.001,
    noiseFloorDb: -60,
    snrDb: 40,
    clipping: false,
    clippedSampleRatio: 0,
    rejectReason: null,
  };
}
