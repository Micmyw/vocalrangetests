import { describe, expect, it } from "vitest";
import { centsBetween, mapFrequencyToNote } from "./NoteMapper";

describe("mapFrequencyToNote", () => {
  it("maps A4 at concert pitch", () => {
    expect(mapFrequencyToNote(440)).toEqual({
      frequencyHz: 440,
      midi: 69,
      note: "A4",
      cents: 0,
    });
  });

  it("maps C4 and reports a signed cents offset", () => {
    const note = mapFrequencyToNote(264);

    expect(note?.note).toBe("C4");
    expect(note?.midi).toBe(60);
    expect(note?.cents).toBeCloseTo(15.68, 1);
  });

  it("returns null for zero, negative, and non-finite values", () => {
    expect(mapFrequencyToNote(0)).toBeNull();
    expect(mapFrequencyToNote(-110)).toBeNull();
    expect(mapFrequencyToNote(Number.NaN)).toBeNull();
  });
});

describe("centsBetween", () => {
  it("reports octave relationships", () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 8);
    expect(centsBetween(220, 440)).toBeCloseTo(-1200, 8);
  });
});
