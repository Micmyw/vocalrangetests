import { describe, expect, it } from "vitest";
import {
  createBenchmarkDefinitions,
  generateSyntheticFixture,
  rootMeanSquare,
} from "./syntheticFixtures";

describe("synthetic fixtures", () => {
  it("generates a deterministic sine at the requested size", () => {
    const first = generateSyntheticFixture({
      id: "a4-sine",
      kind: "sine",
      targetFrequencyHz: 440,
      sampleRate: 48_000,
      length: 4096,
      seed: 7,
    });
    const second = generateSyntheticFixture({
      id: "a4-sine",
      kind: "sine",
      targetFrequencyHz: 440,
      sampleRate: 48_000,
      length: 4096,
      seed: 7,
    });

    expect(first.samples).toEqual(second.samples);
    expect(first.samples).toHaveLength(4096);
    expect(first.referenceFrequencyAt(0.02)).toBe(440);
    expect(rootMeanSquare(first.samples)).toBeGreaterThan(0.2);
  });

  it("adds white noise at the requested SNR", () => {
    const clean = generateSyntheticFixture({
      id: "clean",
      kind: "sine",
      targetFrequencyHz: 440,
      sampleRate: 48_000,
      length: 4096,
      seed: 11,
    });
    const noisy = generateSyntheticFixture({
      id: "noisy",
      kind: "noise",
      targetFrequencyHz: 440,
      sampleRate: 48_000,
      length: 4096,
      snrDb: 20,
      seed: 11,
    });
    const difference = Float32Array.from(noisy.samples, (value, index) => value - clean.samples[index]);
    const measuredSnr = 20 * Math.log10(rootMeanSquare(clean.samples) / rootMeanSquare(difference));

    expect(measuredSnr).toBeCloseTo(20, 1);
  });

  it("provides time-varying references for vibrato and glide", () => {
    const vibrato = generateSyntheticFixture({
      id: "vibrato",
      kind: "vibrato",
      targetFrequencyHz: 440,
      sampleRate: 48_000,
      length: 4096,
      vibratoCents: 50,
      seed: 1,
    });
    const glide = generateSyntheticFixture({
      id: "glide",
      kind: "glide",
      targetFrequencyHz: 440,
      sampleRate: 48_000,
      length: 48_000,
      seed: 1,
    });

    expect(vibrato.referenceFrequencyAt(0.05)).toBeCloseTo(440 * 2 ** (50 / 1200), 5);
    expect(glide.referenceFrequencyAt(0)).toBeLessThan(440);
    expect(glide.referenceFrequencyAt(1)).toBeGreaterThan(440);
  });

  it("covers every requested fixture category and frequency", () => {
    const definitions = createBenchmarkDefinitions();
    const kinds = new Set(definitions.map((definition) => definition.kind));
    const frequencies = new Set(definitions.map((definition) => definition.targetFrequencyHz));

    expect(frequencies).toEqual(new Set([55, 65.41, 82.41, 110, 196, 440, 880, 1046.5, 1396.9, null]));
    expect(kinds).toEqual(new Set([
      "sine",
      "harmonic-stack",
      "strong-second-harmonic",
      "vibrato",
      "glide",
      "noise",
      "hum",
      "clipping",
      "silence",
    ]));
  });
});
