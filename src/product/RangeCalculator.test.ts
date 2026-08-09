import { describe, expect, it } from "vitest";
import { calculateRange } from "./RangeCalculator";

describe("calculateRange", () => {
  it("uses displayed MIDI notes for semitones and exact frequencies for decimal octaves", () => {
    const result = calculateRange(
      { frequencyHz: 207.65, midi: 56, note: "G♯3", cents: 0 },
      { frequencyHz: 659.26, midi: 76, note: "E5", cents: 0 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid range");
    expect(result.semitoneSpan).toBe(20);
    expect(result.octaveSpan).toBeCloseTo(Math.log2(659.26 / 207.65), 8);
  });

  it("keeps note display and semitone span consistent near rounding boundaries", () => {
    const result = calculateRange(
      { frequencyHz: 216, midi: 56, note: "G♯3", cents: 49 },
      { frequencyHz: 427.5, midi: 69, note: "A4", cents: -49 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid range");
    expect(result.semitoneSpan).toBe(13);
    expect(result.octaveSpan).toBeCloseTo(Math.log2(427.5 / 216), 8);
  });

  it("rejects a highest endpoint that is not above the lowest endpoint", () => {
    expect(calculateRange(
      { frequencyHz: 440, midi: 69, note: "A4", cents: 0 },
      { frequencyHz: 439, midi: 69, note: "A4", cents: -4 },
    )).toEqual({ ok: false, reason: "highest-not-above-lowest" });
  });
});
