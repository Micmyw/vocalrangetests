import { describe, expect, it, vi } from "vitest";
import type { VocalRangeTestSnapshot } from "./VocalRangeTestController";
import { buildVocalRangeToolMarkup, VocalRangeTestView } from "./VocalRangeTestView";

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
      stableProgressRatio: 0.5,
      captureElapsedMs: 900,
      currentNote: "A3",
      inputLevel: 0.5,
      microphoneActive: true,
      statusMessage: "Stable pitch found. Keep holding it steady…",
    }));

    expect(markup).toContain("Sing your lowest comfortable note");
    expect(markup).toContain("Current note");
    expect(markup).toContain("A3");
    expect(markup).toContain("Input level");
    expect(markup).toContain('data-level="0.5"');
    expect(markup).toContain("Pitch stability");
    expect(markup).toContain("Stable pitch found");
    expect(markup).toContain("<progress");
    expect(markup).toContain('value="50"');
    expect(markup).toContain('data-action="stop-test"');
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
    expect(markup).not.toContain("data-stable-progress");
    expect(markup).toContain("Total range");
    expect(markup).not.toContain('ph ph-check"');
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
    expect(markup).toContain('role="alert"');
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
    expect(markup).toContain('<li data-state="current" aria-current="step"><span>Room');
    expect(markup).toContain('<li data-state="upcoming"><span>Lowest');
    expect(markup).not.toContain("Try your lowest note again");
  });

  it("marks only the room step current while calibrating", () => {
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "calibrating",
      activeEndpoint: "lowest",
      microphoneActive: true,
      calibrationRemainingMs: 2_000,
    }));

    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
    expect(markup).toContain('<li data-state="current" aria-current="step"><span>Room');
    expect(markup).toContain('<li data-state="upcoming"><span>Lowest');
  });

  it("keeps the endpoint being retested current even when an old result exists", () => {
    const lowest = { frequencyHz: 220, midi: 57, note: "A3", cents: 0 };
    const highest = { frequencyHz: 440, midi: 69, note: "A4", cents: 0 };
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "lowest-ready",
      activeEndpoint: "lowest",
      lowest,
      highest,
      result: { lowest, highest, semitoneSpan: 12, octaveSpan: 1 },
      microphoneActive: true,
    }));

    expect(markup).toContain('<li data-state="current" aria-current="step"><span>Lowest</span>');
    expect(markup).toContain('data-action="cancel-retest"');
    expect(markup).toContain("Back to result");
    expect(markup).not.toContain('<li data-state="complete"><i class="ph ph-check" aria-hidden="true"></i><span>Lowest</span>');
  });

  it("pads chart endpoints away from the edges for octave-boundary results", () => {
    const lowest = { frequencyHz: 130.81, midi: 48, note: "C3", cents: 0 };
    const highest = { frequencyHz: 523.25, midi: 72, note: "C5", cents: 0 };
    const markup = buildVocalRangeToolMarkup(snapshot({
      phase: "result",
      result: { lowest, highest, semitoneSpan: 24, octaveSpan: 2 },
      lowest,
      highest,
    }));

    expect(markup).not.toContain("--range-start:0%");
    expect(markup).not.toContain("--range-end:100%");
  });

  it("does not move focus on the initial render, then focuses user-triggered phase changes", async () => {
    const focus = vi.fn();
    const root = {
      innerHTML: "",
      addEventListener: vi.fn(),
      contains: vi.fn(() => true),
      querySelector: vi.fn(() => ({ focus })),
    } as unknown as HTMLElement;
    const view = new VocalRangeTestView(root, handlers());

    view.render(snapshot());
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();

    view.render(snapshot({ phase: "requesting-permission", activeEndpoint: "lowest" }));
    await Promise.resolve();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("throttles changing status announcements while preserving live visual updates", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const liveRegion = { textContent: "Listening for a steady note…" };
      const visualStatus = { textContent: "Listening for a steady note…" };
      const root = {
        innerHTML: "",
        addEventListener: vi.fn(),
        contains: vi.fn(() => true),
        querySelector: vi.fn((selector: string) => {
          if (selector === "[data-live]") return liveRegion;
          if (selector === "[data-status]") return visualStatus;
          return null;
        }),
      } as unknown as HTMLElement;
      const view = new VocalRangeTestView(root, handlers());
      const listening = snapshot({
        phase: "lowest-capturing",
        activeEndpoint: "lowest",
        statusMessage: "Listening for a steady note…",
      });
      view.render(listening);

      vi.setSystemTime(100);
      view.render({ ...listening, statusMessage: "Your signal is too quiet." });
      expect(visualStatus.textContent).toBe("Your signal is too quiet.");
      expect(liveRegion.textContent).toBe("Listening for a steady note…");

      vi.setSystemTime(1_100);
      view.render({ ...listening, statusMessage: "Your signal is too quiet." });
      expect(liveRegion.textContent).toBe("Your signal is too quiet.");
    } finally {
      vi.useRealTimers();
    }
  });
});

function handlers() {
  return {
    onStartTest: vi.fn(async () => undefined),
    onStartCapture: vi.fn(),
    onRetryCapture: vi.fn(),
    onReopenMicrophone: vi.fn(async () => undefined),
    onContinueSuccess: vi.fn(async () => undefined),
    onRetestEndpoint: vi.fn(async () => undefined),
    onTestAgain: vi.fn(async () => undefined),
    onStopTest: vi.fn(async () => undefined),
    onCancelRetest: vi.fn(async () => undefined),
  };
}

function snapshot(patch: Partial<VocalRangeTestSnapshot> = {}): VocalRangeTestSnapshot {
  return {
    phase: "intro",
    activeEndpoint: null,
    calibrationRemainingMs: null,
    captureElapsedMs: null,
    stableDurationMs: 0,
    stableProgressRatio: 0,
    statusMessage: "Ready to start.",
    errorMessage: null,
    recoveryAction: null,
    lowest: null,
    highest: null,
    result: null,
    overlaps: [],
    noiseFloorRms: null,
    stableLocked: false,
    currentNote: null,
    inputLevel: 0,
    microphoneActive: false,
    ...patch,
  };
}
