import "../style.css";
import { buildVocalRangeToolMarkup } from "./VocalRangeTestView";
import type { VocalRangeTestSnapshot } from "./VocalRangeTestController";

const lowest = { frequencyHz: 207.65, midi: 56, note: "G♯3", cents: 0 };
const highest = { frequencyHz: 659.26, midi: 76, note: "E5", cents: 0 };
const snapshot: VocalRangeTestSnapshot = {
  phase: "result",
  activeEndpoint: null,
  calibrationRemainingMs: null,
  captureElapsedMs: null,
  stableDurationMs: 0,
  stableProgressRatio: 1,
  statusMessage: "Your vocal range is ready.",
  errorMessage: null,
  recoveryAction: null,
  lowest,
  highest,
  result: { lowest, highest, semitoneSpan: 20, octaveSpan: 1.667 },
  overlaps: [
    { label: "Countertenor", overlapSemitones: 20, overlapScore: 0.83 },
    { label: "Contralto", overlapSemitones: 20, overlapScore: 0.8 },
    { label: "Mezzo-soprano", overlapSemitones: 19, overlapScore: 0.76 },
  ],
  noiseFloorRms: 0.001,
  stableLocked: false,
  currentNote: null,
  inputLevel: 0,
  microphoneActive: false,
};

const root = document.querySelector<HTMLElement>("#design-result");
if (!root) throw new Error("Missing #design-result fixture");
root.innerHTML = buildVocalRangeToolMarkup(snapshot);
