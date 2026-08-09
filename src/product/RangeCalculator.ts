import type { CapturedEndpoint, VocalRangeResult } from "./types";

export type RangeCalculation =
  | ({ ok: true } & VocalRangeResult)
  | { ok: false; reason: "highest-not-above-lowest" };

export function calculateRange(
  lowest: CapturedEndpoint,
  highest: CapturedEndpoint,
): RangeCalculation {
  if (highest.frequencyHz <= lowest.frequencyHz || highest.midi <= lowest.midi) {
    return { ok: false, reason: "highest-not-above-lowest" };
  }

  return {
    ok: true,
    lowest,
    highest,
    semitoneSpan: highest.midi - lowest.midi,
    octaveSpan: Math.log2(highest.frequencyHz / lowest.frequencyHz),
  };
}
