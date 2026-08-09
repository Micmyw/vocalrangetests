const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;

export interface NoteMapping {
  frequencyHz: number;
  midi: number;
  note: string;
  cents: number;
}

export function centsBetween(frequencyHz: number, referenceHz: number): number {
  if (frequencyHz <= 0 || referenceHz <= 0) return Number.NaN;
  return 1200 * Math.log2(frequencyHz / referenceHz);
}

export function mapFrequencyToNote(frequencyHz: number): NoteMapping | null {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return null;

  const exactMidi = 69 + 12 * Math.log2(frequencyHz / 440);
  const midi = Math.round(exactMidi);
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;

  return {
    frequencyHz,
    midi,
    note: `${NOTE_NAMES[noteIndex]}${octave}`,
    cents: (exactMidi - midi) * 100,
  };
}
