import { describe, expect, it } from "vitest";
import { PitchyMpmAdapter } from "../dsp/PitchyMpmAdapter";
import { generateVocalLikeSamples } from "./VocalLikeFixtures";

const baseRequest = {
  frequencyHz: 220,
  sampleRate: 48_000,
  length: 48_000,
  seed: 12345,
} as const;

describe("generateVocalLikeSamples", () => {
  it("is deterministic, finite, and bounded", () => {
    const first = generateVocalLikeSamples({ ...baseRequest, profile: "modal" });
    const second = generateVocalLikeSamples({ ...baseRequest, profile: "modal" });

    expect(first).toEqual(second);
    expect(first.every(Number.isFinite)).toBe(true);
    expect(Math.max(...first.map(Math.abs))).toBeLessThanOrEqual(0.95);
  });

  it("adds deterministic breath noise distinct from the modal harmonic stack", () => {
    const modal = generateVocalLikeSamples({ ...baseRequest, profile: "modal" });
    const breathy = generateVocalLikeSamples({ ...baseRequest, profile: "breathy" });
    let differenceSquares = 0;
    for (let index = 0; index < modal.length; index += 1) {
      differenceSquares += (modal[index] - breathy[index]) ** 2;
    }
    expect(Math.sqrt(differenceSquares / modal.length)).toBeGreaterThan(0.015);
  });

  it("produces measurable vibrato and glide movement", () => {
    const detector = new PitchyMpmAdapter(4096);
    const vibrato = generateVocalLikeSamples({ ...baseRequest, profile: "vibrato" });
    const vibratoHigh = detector.detect(vibrato.slice(400, 4496), 48_000)?.frequencyHz;
    const vibratoLow = detector.detect(vibrato.slice(5200, 9296), 48_000)?.frequencyHz;
    expect(vibratoHigh).toBeDefined();
    expect(vibratoLow).toBeDefined();
    expect(Math.abs(vibratoHigh! - vibratoLow!)).toBeGreaterThan(5);

    const glide = generateVocalLikeSamples({ ...baseRequest, profile: "glide" });
    const glideStart = detector.detect(glide.slice(0, 4096), 48_000)?.frequencyHz;
    const glideEnd = detector.detect(glide.slice(-4096), 48_000)?.frequencyHz;
    expect(glideStart).toBeDefined();
    expect(glideEnd).toBeDefined();
    expect(glideEnd!).toBeGreaterThan(glideStart! + 15);
  });

  it("creates irregular fry-like pulse intervals", () => {
    const fry = generateVocalLikeSamples({
      ...baseRequest,
      profile: "fry",
      frequencyHz: 70,
    });
    const peaks: number[] = [];
    for (let index = 1; index < fry.length - 1; index += 1) {
      if (fry[index] > 0.7 && fry[index] >= fry[index - 1] && fry[index] > fry[index + 1]) {
        if (peaks.length === 0 || index - peaks.at(-1)! > 100) peaks.push(index);
      }
    }
    const intervals = peaks.slice(1).map((peak, index) => peak - peaks[index]);
    expect(peaks.length).toBeGreaterThan(20);
    expect(new Set(intervals).size).toBeGreaterThan(3);
  });

  it("supports every requested validation tag profile", () => {
    for (const profile of [
      "modal", "head-falsetto", "breathy", "vibrato", "glide", "fry",
    ] as const) {
      const samples = generateVocalLikeSamples({ ...baseRequest, profile, length: 4096 });
      expect(samples).toHaveLength(4096);
      expect(samples.some((sample) => sample !== 0)).toBe(true);
    }
  });
});
