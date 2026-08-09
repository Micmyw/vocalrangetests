import { describe, expect, it } from "vitest";
import type { PitchDetectorAdapter, PitchEstimate } from "./types";
import { ABRunner } from "./ABRunner";

class RecordingDetector implements PitchDetectorAdapter {
  readonly frameSize = 4096;
  frames: Float32Array[] = [];

  constructor(
    readonly id: "pitchy" | "yin",
    private readonly estimate: PitchEstimate,
  ) {}

  detect(frame: Float32Array): PitchEstimate {
    this.frames.push(frame);
    return this.estimate;
  }
}

describe("ABRunner", () => {
  it("sends the identical PCM object to both detectors", () => {
    const pitchy = new RecordingDetector("pitchy", { frequencyHz: 440, confidence: 0.98 });
    const yin = new RecordingDetector("yin", { frequencyHz: 441, confidence: 0.96 });
    const runner = new ABRunner({
      pitchy,
      yin,
      now: (() => {
        let value = 0;
        return () => ++value;
      })(),
    });
    const frame = Float32Array.from({ length: 4096 }, (_, index) => 0.1 * Math.sin(index));

    const observation = runner.processFrame(frame, 48_000, 1000);

    expect(pitchy.frames[0]).toBe(frame);
    expect(yin.frames[0]).toBe(frame);
    expect(observation.pitchy.note?.note).toBe("A4");
    expect(observation.yin.note?.note).toBe("A4");
    expect(observation.pitchy.processingTimeMs).toBe(1);
    expect(observation.yin.processingTimeMs).toBe(1);
  });

  it("resets attempt stability without clearing history or calibrated noise", () => {
    const pitchy = new RecordingDetector("pitchy", { frequencyHz: 440, confidence: 0.98 });
    const yin = new RecordingDetector("yin", { frequencyHz: 440, confidence: 0.96 });
    const runner = new ABRunner({ pitchy, yin });
    const noise = new Float32Array(4096).fill(0.001);
    runner.beginNoiseCalibration();
    runner.processFrame(noise, 48_000, -50, true);
    const calibratedFloor = runner.finishNoiseCalibration();
    const tone = Float32Array.from(
      { length: 4096 },
      (_, index) => 0.1 * Math.sin((2 * Math.PI * 440 * index) / 48_000),
    );

    let beforeReset = runner.processFrame(tone, 48_000, 0);
    for (let timestamp = 50; timestamp <= 650; timestamp += 50) {
      beforeReset = runner.processFrame(tone, 48_000, timestamp);
    }
    expect(beforeReset.pitchy.stable.state).toBe("stable");
    const historyLength = runner.history.length;

    runner.resetStability();
    const afterReset = runner.processFrame(tone, 48_000, 700);

    expect(afterReset.pitchy.stable.state).toBe("collecting");
    expect(afterReset.signal.noiseFloorRms).toBe(calibratedFloor);
    expect(runner.history).toHaveLength(historyLength + 1);
  });
});
