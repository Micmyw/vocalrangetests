import { describe, expect, it } from "vitest";
import { YinBackupAdapter } from "./YinBackupAdapter";

const SAMPLE_RATE = 48_000;
const FRAME_SIZE = 4096;

function sine(frequencyHz: number, amplitude = 0.6): Float32Array {
  return Float32Array.from(
    { length: FRAME_SIZE },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / SAMPLE_RATE),
  );
}

describe("YinBackupAdapter", () => {
  it.each([55, 440, 1396.9])("detects a clean %f Hz sine", (frequencyHz) => {
    const detector = new YinBackupAdapter(FRAME_SIZE);
    const result = detector.detect(sine(frequencyHz), SAMPLE_RATE);

    expect(result).not.toBeNull();
    expect(result!.frequencyHz).toBeCloseTo(frequencyHz, 0);
    expect(result!.confidence).toBeGreaterThan(0.85);
  });

  it("does not report silence", () => {
    const detector = new YinBackupAdapter(FRAME_SIZE);

    expect(detector.detect(new Float32Array(FRAME_SIZE), SAMPLE_RATE)).toBeNull();
  });

  it("rejects an unexpected frame size", () => {
    const detector = new YinBackupAdapter(FRAME_SIZE);

    expect(() => detector.detect(new Float32Array(8192), SAMPLE_RATE)).toThrow(
      /4096/,
    );
  });
});
