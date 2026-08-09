export interface VoiceRangeReference {
  label: string;
  lowestMidi: number;
  highestMidi: number;
  gender: null;
}

export interface RangeOverlap {
  label: string;
  overlapSemitones: number;
  overlapScore: number;
}

export const VOICE_RANGE_REFERENCE_SOURCE = {
  title: "Vocal range — conventional classical voice ranges",
  url: "https://en.wikipedia.org/w/index.php?title=Vocal_range&oldid=1365646625",
  versionDate: "2026-07-23",
} as const;

export const VOICE_RANGE_REFERENCE: readonly VoiceRangeReference[] = [
  { label: "Bass", lowestMidi: 40, highestMidi: 64, gender: null },
  { label: "Baritone", lowestMidi: 45, highestMidi: 69, gender: null },
  { label: "Tenor", lowestMidi: 48, highestMidi: 72, gender: null },
  { label: "Countertenor", lowestMidi: 52, highestMidi: 76, gender: null },
  { label: "Contralto", lowestMidi: 53, highestMidi: 77, gender: null },
  { label: "Mezzo-soprano", lowestMidi: 57, highestMidi: 81, gender: null },
  { label: "Soprano", lowestMidi: 60, highestMidi: 84, gender: null },
] as const;

const MINIMUM_MEANINGFUL_OVERLAP_SEMITONES = 6;
const MAXIMUM_RESULTS = 3;

export function calculateRangeOverlap(
  lowestMidi: number,
  highestMidi: number,
): RangeOverlap[] {
  if (!Number.isFinite(lowestMidi) || !Number.isFinite(highestMidi) || highestMidi <= lowestMidi) {
    return [];
  }

  return VOICE_RANGE_REFERENCE.flatMap((reference, sourceIndex) => {
    const intersectionLow = Math.max(lowestMidi, reference.lowestMidi);
    const intersectionHigh = Math.min(highestMidi, reference.highestMidi);
    const overlapSemitones = Math.max(0, intersectionHigh - intersectionLow);
    if (overlapSemitones < MINIMUM_MEANINGFUL_OVERLAP_SEMITONES) return [];
    const unionLow = Math.min(lowestMidi, reference.lowestMidi);
    const unionHigh = Math.max(highestMidi, reference.highestMidi);
    return [{
      label: reference.label,
      overlapSemitones,
      overlapScore: overlapSemitones / (unionHigh - unionLow),
      sourceIndex,
    }];
  }).sort((left, right) =>
    right.overlapScore - left.overlapScore ||
    right.overlapSemitones - left.overlapSemitones ||
    left.sourceIndex - right.sourceIndex,
  ).slice(0, MAXIMUM_RESULTS).map(({ sourceIndex: _sourceIndex, ...overlap }) => overlap);
}
