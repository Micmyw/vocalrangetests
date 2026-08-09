import { describe, expect, it } from "vitest";
import { calculateRangeOverlap, VOICE_RANGE_REFERENCE } from "./RangeOverlapCalculator";

describe("calculateRangeOverlap", () => {
  it("uses one gender-neutral conventional reference table", () => {
    expect(VOICE_RANGE_REFERENCE.map((item) => item.label)).toEqual([
      "Bass",
      "Baritone",
      "Tenor",
      "Countertenor",
      "Contralto",
      "Mezzo-soprano",
      "Soprano",
    ]);
    expect(VOICE_RANGE_REFERENCE.every((item) => item.gender === null)).toBe(true);
  });

  it("returns the strongest measured-range overlaps in deterministic order", () => {
    const overlaps = calculateRangeOverlap(56, 76);

    expect(overlaps).toHaveLength(3);
    expect(overlaps.map((item) => item.label)).toEqual([
      "Countertenor",
      "Contralto",
      "Mezzo-soprano",
    ]);
    expect(overlaps[0].overlapSemitones).toBeGreaterThanOrEqual(6);
  });

  it("returns no category when the intersection is too small", () => {
    expect(calculateRangeOverlap(96, 100)).toEqual([]);
  });
});
