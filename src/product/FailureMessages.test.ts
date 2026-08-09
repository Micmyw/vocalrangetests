import { describe, expect, it } from "vitest";
import { failureMessageFor } from "./FailureMessages";

describe("failureMessageFor", () => {
  it("uses the approved terminal-stability instruction", () => {
    expect(failureMessageFor("insufficient-terminal-stability")).toBe(
      "Keep the note steady a little longer.",
    );
  });

  it("turns detector reasons into plain recovery instructions", () => {
    expect(failureMessageFor("input-clipping")).toContain("too loud");
    expect(failureMessageFor("octave-ambiguous")).toContain("unclear pitch");
    expect(failureMessageFor("no-pitch")).toContain("“ah” or “oo”");
  });
});
