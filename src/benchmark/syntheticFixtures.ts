export type SyntheticFixtureKind =
  | "sine"
  | "harmonic-stack"
  | "strong-second-harmonic"
  | "vibrato"
  | "glide"
  | "noise"
  | "hum"
  | "clipping"
  | "silence";

export const SYNTHETIC_FIXTURE_KINDS: SyntheticFixtureKind[] = [
  "sine",
  "harmonic-stack",
  "strong-second-harmonic",
  "vibrato",
  "glide",
  "noise",
  "hum",
  "clipping",
  "silence",
];

export interface SyntheticFixtureDefinition {
  id: string;
  kind: SyntheticFixtureKind;
  targetFrequencyHz: number | null;
  vibratoCents?: 25 | 50 | 100;
  snrDb?: 10 | 20 | 30;
  humFrequencyHz?: 50 | 60;
}

export interface SyntheticFixtureRequest extends SyntheticFixtureDefinition {
  sampleRate: number;
  length: number;
  seed: number;
}

export interface SyntheticFixture {
  id: string;
  samples: Float32Array;
  referenceFrequencyAt(timeSeconds: number): number | null;
}

export const BENCHMARK_FREQUENCIES = [
  55,
  65.41,
  82.41,
  110,
  196,
  440,
  880,
  1046.5,
  1396.9,
] as const;

export function rootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let squareSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    squareSum += samples[index] * samples[index];
  }
  return Math.sqrt(squareSum / samples.length);
}

export function createBenchmarkDefinitions(): SyntheticFixtureDefinition[] {
  const definitions: SyntheticFixtureDefinition[] = [];
  for (const targetFrequencyHz of BENCHMARK_FREQUENCIES) {
    const prefix = targetFrequencyHz.toString().replace(".", "_");
    definitions.push(
      { id: `${prefix}-sine`, kind: "sine", targetFrequencyHz },
      { id: `${prefix}-harmonic`, kind: "harmonic-stack", targetFrequencyHz },
      { id: `${prefix}-strong-h2`, kind: "strong-second-harmonic", targetFrequencyHz },
      ...([25, 50, 100] as const).map((vibratoCents) => ({
        id: `${prefix}-vibrato-${vibratoCents}`,
        kind: "vibrato" as const,
        targetFrequencyHz,
        vibratoCents,
      })),
      { id: `${prefix}-glide`, kind: "glide", targetFrequencyHz },
      ...([30, 20, 10] as const).map((snrDb) => ({
        id: `${prefix}-snr-${snrDb}`,
        kind: "noise" as const,
        targetFrequencyHz,
        snrDb,
      })),
      ...([50, 60] as const).map((humFrequencyHz) => ({
        id: `${prefix}-hum-${humFrequencyHz}`,
        kind: "hum" as const,
        targetFrequencyHz,
        humFrequencyHz,
      })),
      { id: `${prefix}-clipping`, kind: "clipping", targetFrequencyHz },
    );
  }
  definitions.push({ id: "silence", kind: "silence", targetFrequencyHz: null });
  return definitions;
}

export function generateSyntheticFixture(request: SyntheticFixtureRequest): SyntheticFixture {
  const durationSeconds = request.length / request.sampleRate;
  const target = request.targetFrequencyHz;
  const referenceFrequencyAt = (timeSeconds: number): number | null => {
    if (target === null || request.kind === "silence") return null;
    if (request.kind === "vibrato") {
      const cents = (request.vibratoCents ?? 50) * Math.sin(2 * Math.PI * 5 * timeSeconds);
      return target * 2 ** (cents / 1200);
    }
    if (request.kind === "glide") {
      const progress = Math.max(0, Math.min(1, timeSeconds / durationSeconds));
      const cents = -100 + 200 * progress;
      return target * 2 ** (cents / 1200);
    }
    return target;
  };

  if (request.kind === "silence") {
    return { id: request.id, samples: new Float32Array(request.length), referenceFrequencyAt };
  }

  const samples = new Float32Array(request.length);
  let phase = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const timeSeconds = index / request.sampleRate;
    const frequencyHz = referenceFrequencyAt(timeSeconds)!;
    phase += (2 * Math.PI * frequencyHz) / request.sampleRate;

    if (request.kind === "harmonic-stack") {
      samples[index] = 0.35 * (
        Math.sin(phase) +
        0.45 * Math.sin(2 * phase) +
        0.25 * Math.sin(3 * phase) +
        0.12 * Math.sin(4 * phase)
      );
    } else if (request.kind === "strong-second-harmonic") {
      samples[index] = 0.35 * (
        0.15 * Math.sin(phase) +
        Math.sin(2 * phase) +
        0.25 * Math.sin(3 * phase)
      );
    } else if (request.kind === "clipping") {
      samples[index] = Math.max(-1, Math.min(1, 1.35 * Math.sin(phase)));
    } else {
      samples[index] = 0.35 * Math.sin(phase);
    }
  }

  if (request.kind === "noise") {
    addNoiseAtSnr(samples, request.snrDb ?? 20, request.seed);
  } else if (request.kind === "hum") {
    const humFrequencyHz = request.humFrequencyHz ?? 50;
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] += 0.08 * Math.sin((2 * Math.PI * humFrequencyHz * index) / request.sampleRate);
    }
  }

  return { id: request.id, samples, referenceFrequencyAt };
}

function addNoiseAtSnr(samples: Float32Array, snrDb: number, seed: number): void {
  const noise = new Float64Array(samples.length);
  let state = seed >>> 0;
  let noiseSquareSum = 0;
  for (let index = 0; index < noise.length; index += 1) {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const uniform = ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    noise[index] = uniform * 2 - 1;
    noiseSquareSum += noise[index] * noise[index];
  }

  const signalRms = rootMeanSquare(samples);
  const noiseRms = Math.sqrt(noiseSquareSum / noise.length);
  const targetNoiseRms = signalRms / 10 ** (snrDb / 20);
  const scale = targetNoiseRms / noiseRms;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] += noise[index] * scale;
  }
}
