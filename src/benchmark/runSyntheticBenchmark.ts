import { PitchyMpmAdapter } from "../dsp/PitchyMpmAdapter";
import { YinBackupAdapter } from "../dsp/YinBackupAdapter";
import type { PitchDetectorAdapter } from "../dsp/types";
import {
  summarizeDetectorObservations,
  type DetectorMetricObservation,
  type DetectorMetricSummary,
} from "./metrics";
import {
  createBenchmarkDefinitions,
  generateSyntheticFixture,
  SYNTHETIC_FIXTURE_KINDS,
  type SyntheticFixtureDefinition,
  type SyntheticFixtureKind,
} from "./syntheticFixtures";

export interface BenchmarkConfiguration {
  id: string;
  frameSize: 4096 | 8192;
  cadenceHz: 15 | 20;
}

export interface BenchmarkConfigurationReport {
  id: string;
  frameSize: number;
  cadenceHz: number;
  sampleRates: number[];
  fixtureCount: number;
  frameCount: number;
  pitchy: DetectorMetricSummary;
  yin: DetectorMetricSummary;
  byKind: Record<SyntheticFixtureKind, {
    pitchy: DetectorMetricSummary;
    yin: DetectorMetricSummary;
  }>;
  byFixture: Record<string, {
    pitchy: DetectorMetricSummary;
    yin: DetectorMetricSummary;
  }>;
}

export interface SyntheticBenchmarkReport {
  generatedAt: string;
  configurations: BenchmarkConfigurationReport[];
}

export interface SyntheticBenchmarkOptions {
  definitions?: SyntheticFixtureDefinition[];
  configurations?: BenchmarkConfiguration[];
  sampleRates?: number[];
  framesPerFixture?: number;
}

export const DEFAULT_BENCHMARK_CONFIGURATIONS: BenchmarkConfiguration[] = [
  { id: "4096-20hz", frameSize: 4096, cadenceHz: 20 },
  { id: "8192-15hz", frameSize: 8192, cadenceHz: 15 },
];

export function runSyntheticBenchmark(
  options: SyntheticBenchmarkOptions = {},
): SyntheticBenchmarkReport {
  const definitions = options.definitions ?? createBenchmarkDefinitions();
  const configurations = options.configurations ?? DEFAULT_BENCHMARK_CONFIGURATIONS;
  const sampleRates = options.sampleRates ?? [44_100, 48_000];
  const framesPerFixture = options.framesPerFixture ?? 3;

  return {
    generatedAt: new Date().toISOString(),
    configurations: configurations.map((configuration) => {
      const pitchyObservations: DetectorMetricObservation[] = [];
      const yinObservations: DetectorMetricObservation[] = [];
      const byKindObservations = Object.fromEntries(
        SYNTHETIC_FIXTURE_KINDS.map((kind) => [kind, {
          pitchy: [] as DetectorMetricObservation[],
          yin: [] as DetectorMetricObservation[],
        }]),
      ) as Record<SyntheticFixtureKind, {
        pitchy: DetectorMetricObservation[];
        yin: DetectorMetricObservation[];
      }>;
      const byFixtureObservations = Object.fromEntries(
        definitions.map((definition) => [definition.id, {
          pitchy: [] as DetectorMetricObservation[],
          yin: [] as DetectorMetricObservation[],
        }]),
      ) as Record<string, {
        pitchy: DetectorMetricObservation[];
        yin: DetectorMetricObservation[];
      }>;
      const pitchy = new PitchyMpmAdapter(configuration.frameSize);
      const yin = new YinBackupAdapter(configuration.frameSize);

      for (const sampleRate of sampleRates) {
        const hopSize = Math.max(1, Math.round(sampleRate / configuration.cadenceHz));
        const length = configuration.frameSize + hopSize * (framesPerFixture - 1);

        definitions.forEach((definition, definitionIndex) => {
          const fixture = generateSyntheticFixture({
            ...definition,
            sampleRate,
            length,
            seed: 0x51f15e + definitionIndex,
          });

          for (let frameIndex = 0; frameIndex < framesPerFixture; frameIndex += 1) {
            const offset = frameIndex * hopSize;
            const frame = fixture.samples.slice(offset, offset + configuration.frameSize);
            const referenceTime = (offset + configuration.frameSize / 2) / sampleRate;
            const expectedFrequencyHz = fixture.referenceFrequencyAt(referenceTime);
            const pitchyObservation = measure(pitchy, frame, sampleRate, expectedFrequencyHz);
            const yinObservation = measure(yin, frame, sampleRate, expectedFrequencyHz);
            pitchyObservations.push(pitchyObservation);
            yinObservations.push(yinObservation);
            byKindObservations[definition.kind].pitchy.push(pitchyObservation);
            byKindObservations[definition.kind].yin.push(yinObservation);
            byFixtureObservations[definition.id].pitchy.push(pitchyObservation);
            byFixtureObservations[definition.id].yin.push(yinObservation);
          }
        });
      }

      return {
        id: configuration.id,
        frameSize: configuration.frameSize,
        cadenceHz: configuration.cadenceHz,
        sampleRates: [...sampleRates],
        fixtureCount: definitions.length * sampleRates.length,
        frameCount: definitions.length * sampleRates.length * framesPerFixture,
        pitchy: summarizeDetectorObservations(pitchyObservations),
        yin: summarizeDetectorObservations(yinObservations),
        byKind: Object.fromEntries(SYNTHETIC_FIXTURE_KINDS.map((kind) => [kind, {
          pitchy: summarizeDetectorObservations(byKindObservations[kind].pitchy),
          yin: summarizeDetectorObservations(byKindObservations[kind].yin),
        }])) as BenchmarkConfigurationReport["byKind"],
        byFixture: Object.fromEntries(definitions.map((definition) => [definition.id, {
          pitchy: summarizeDetectorObservations(byFixtureObservations[definition.id].pitchy),
          yin: summarizeDetectorObservations(byFixtureObservations[definition.id].yin),
        }])),
      };
    }),
  };
}

function measure(
  detector: PitchDetectorAdapter,
  frame: Float32Array,
  sampleRate: number,
  expectedFrequencyHz: number | null,
): DetectorMetricObservation {
  const startedAt = performance.now();
  const estimate = detector.detect(frame, sampleRate);
  return {
    expectedFrequencyHz,
    detectedFrequencyHz: estimate?.frequencyHz ?? null,
    processingTimeMs: performance.now() - startedAt,
  };
}
