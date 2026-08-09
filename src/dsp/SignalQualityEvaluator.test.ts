import { describe, expect, it } from "vitest";
import { SignalQualityEvaluator } from "./SignalQualityEvaluator";

function alternating(length: number, amplitude: number): Float32Array {
  return Float32Array.from(
    { length },
    (_, index) => (index % 2 === 0 ? amplitude : -amplitude),
  );
}

describe("SignalQualityEvaluator", () => {
  it("calibrates a median noise floor and reports SNR", () => {
    const evaluator = new SignalQualityEvaluator({ minimumRms: 0.001 });
    evaluator.beginCalibration();
    evaluator.recordNoiseFrame(alternating(1024, 0.001));
    evaluator.recordNoiseFrame(alternating(1024, 0.002));
    evaluator.recordNoiseFrame(alternating(1024, 0.003));
    evaluator.finishCalibration();

    const result = evaluator.evaluate(alternating(1024, 0.02));

    expect(result.noiseFloorRms).toBeCloseTo(0.002, 6);
    expect(result.snrDb).toBeCloseTo(20, 1);
    expect(result.state).toBe("usable");
  });

  it("reports calibration frames without treating them as notes", () => {
    const evaluator = new SignalQualityEvaluator();
    evaluator.beginCalibration();

    const result = evaluator.recordNoiseFrame(alternating(256, 0.001));

    expect(result.state).toBe("calibrating");
    expect(result.rejectReason).toBe("noise-floor-calibration");
  });

  it("classifies silence and low-SNR input", () => {
    const evaluator = new SignalQualityEvaluator({ minimumRms: 0.001, minSnrDb: 10 });
    evaluator.beginCalibration();
    evaluator.recordNoiseFrame(alternating(256, 0.01));
    evaluator.finishCalibration();

    expect(evaluator.evaluate(new Float32Array(256)).state).toBe("silence");
    expect(evaluator.evaluate(alternating(256, 0.015)).state).toBe("noisy");
  });

  it("rejects frames with sustained clipping", () => {
    const evaluator = new SignalQualityEvaluator();
    const clipped = alternating(1000, 0.4);
    for (let index = 0; index < 20; index += 1) clipped[index] = index % 2 ? -1 : 1;

    const result = evaluator.evaluate(clipped);

    expect(result.clipping).toBe(true);
    expect(result.clippedSampleRatio).toBeCloseTo(0.02, 4);
    expect(result.state).toBe("clipped");
  });

  it("combines raw signal quality with pitch presence and clarity", () => {
    const evaluator = new SignalQualityEvaluator({ minimumConfidence: 0.75 });
    const metrics = evaluator.measure(alternating(1024, 0.1));

    expect(evaluator.evaluateMeasurement(metrics, null)).toMatchObject({
      state: "no-pitch",
      rejectReason: "no-pitch",
    });
    expect(evaluator.evaluateMeasurement(metrics, {
      frequencyHz: 220,
      confidence: 0.4,
    })).toMatchObject({
      state: "low-confidence",
      rejectReason: "low-confidence",
    });
    expect(evaluator.evaluateMeasurement(metrics, {
      frequencyHz: 220,
      confidence: 0.95,
    })).toMatchObject({ state: "usable", rejectReason: null });
  });

  it("prioritizes clipping over an otherwise valid pitch", () => {
    const evaluator = new SignalQualityEvaluator();
    const clipped = alternating(100, 1);

    expect(evaluator.evaluateMeasurement(evaluator.measure(clipped), {
      frequencyHz: 220,
      confidence: 0.99,
    })).toMatchObject({ state: "clipped", rejectReason: "input-clipping" });
  });
});
