import { describe, expect, it } from "vitest";
import { buildValidationHarnessMarkup } from "./ValidationHarnessView";

describe("buildValidationHarnessMarkup", () => {
  it("contains the controlled instructions, tags, progress, diagnostics, summary, and export controls", () => {
    const markup = buildValidationHarnessMarkup("T-ABC123");

    expect(markup).toContain("Real Device Validation Harness");
    expect(markup).toContain("Anonymous tester ID");
    expect(markup).toContain("T-ABC123");
    expect(markup).toContain("Use a quiet room");
    expect(markup).toContain("Prefer the built-in microphone");
    expect(markup).toContain("lowest comfortable note you can hold steadily");
    expect(markup).toContain("highest comfortable note you can hold steadily");
    expect(markup).toContain("Hold each note for about 3 seconds");
    expect(markup).toContain("Do not force an extreme note");
    for (const tag of ["modal", "head-falsetto", "breathy", "vibrato", "glide", "fry"]) {
      expect(markup).toContain(`value="${tag}"`);
    }
    for (const field of [
      "RMS", "Noise floor / SNR", "Clipping", "Pitchy Hz / note / clarity",
      "YIN Hz / note / confidence", "Signal state", "Stable state",
      "Stable duration", "Reject reason", "Detector processing time",
    ]) expect(markup).toContain(field);
    expect(markup).toContain("Lowest progress");
    expect(markup).toContain("Highest progress");
    expect(markup).toContain("Session Summary");
    expect(markup).toContain("Download JSON");
    expect(markup).toContain("Copy result as text");
    expect(markup).toContain('class="environment breakable"');
    expect(markup).not.toContain("8192");
    expect(markup).not.toMatch(/type="(?:email|file)"/);
  });
});
