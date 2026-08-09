import { describe, expect, it } from "vitest";
import type { VocalRangeTestSnapshot } from "./VocalRangeTestController";
import { buildVocalRangeToolMarkup } from "./VocalRangeTestView";

describe("buildVocalRangeToolMarkup", () => {
  it("renders an accessible Intro with one step heading and a real start button", () => {
    const markup = buildVocalRangeToolMarkup(snapshot());

    expect(markup).toContain("<h2");
    expect(markup).toContain("Ready to find your range?");
    expect(markup).toContain('data-action="start-test"');
    expect(markup).toContain("Start Vocal Range Test");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("don’t force an extreme");
  });

  it("renders stable capture guidance without hard requiring three seconds", () => {
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "lowest-capturing",
      activeEndpoint: "lowest",
      stableDurationMs: 650,
      captureElapsedMs: 900,
      statusMessage: "Stable pitch found. Keep holding it steady…",
    }));

    expect(markup).toContain("Sing your lowest comfortable note");
    expect(markup).toContain("Hold it steadily for about 3 seconds");
    expect(markup).toContain("Stable pitch found");
    expect(markup).toContain("<progress");
    expect(markup).not.toContain("must sing for 3 seconds");
  });

  it("renders complete textual results and a supplementary Measured range visualization", () => {
    const lowest = { frequencyHz: 207.65, midi: 56, note: "G♯3", cents: 0 };
    const highest = { frequencyHz: 659.26, midi: 76, note: "E5", cents: 0 };
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "result",
      result: { lowest, highest, semitoneSpan: 20, octaveSpan: 1.667 },
      lowest,
      highest,
      overlaps: [
        { label: "Countertenor", overlapSemitones: 20, overlapScore: 0.83 },
        { label: "Contralto", overlapSemitones: 20, overlapScore: 0.8 },
      ],
    }));

    expect(markup).toContain("Your vocal range");
    expect(markup).toContain("G♯3");
    expect(markup).toContain("E5");
    expect(markup).toContain("Detected: G♯3");
    expect(markup).toContain("Detected: E5");
    expect(markup).toContain("20 semitones");
    expect(markup).toContain("1.67 octaves");
    expect(markup).toContain("Measured range");
    expect(markup).toContain('role="img"');
    expect(markup).toContain("131 Hz");
    expect(markup).toContain("523 Hz");
    expect(markup).toContain("not a definitive voice classification");
    expect(markup).toContain('data-action="retest-lowest"');
    expect(markup).toContain('data-action="retest-highest"');
    expect(markup).toContain('data-action="test-again"');
    expect(markup).not.toContain("±0.12");
  });

  it("shows a visible recovery action for a failed capture", () => {
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "recoverable-error",
      activeEndpoint: "highest",
      errorMessage: "Keep the note steady a little longer.",
      recoveryAction: "retry-capture",
    }));

    expect(markup).toContain("Keep the note steady a little longer.");
    expect(markup).toContain('data-action="retry-capture"');
    expect(markup).toContain("Try again");
  });

  it("keeps the room step current when microphone access must be reopened", () => {
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "recoverable-error",
      activeEndpoint: "lowest",
      errorMessage: "Your microphone could not be opened.",
      recoveryAction: "reopen-microphone",
    }));

    expect(markup).toContain("Microphone access needed");
    expect(markup).toContain('<li data-state="current"><span>Room');
    expect(markup).toContain('<li data-state="upcoming"><span>Lowest');
    expect(markup).not.toContain("Try your lowest note again");
  });
});

function snapshot(patch: Partial<VocalRangeTestSnapshot> = {}): VocalRangeTestSnapshot {
  return {
    phase: "intro",
    activeEndpoint: null,
    calibrationRemainingMs: null,
    captureElapsedMs: null,
    stableDurationMs: 0,
    statusMessage: "Ready to start.",
    errorMessage: null,
    recoveryAction: null,
    lowest: null,
    highest: null,
    result: null,
    overlaps: [],
    noiseFloorRms: null,
    stableLocked: false,
    ...patch,
  };
}
