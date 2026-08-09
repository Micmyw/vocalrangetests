import { ABRunner } from "../dsp/ABRunner";
import { PitchyMpmAdapter } from "../dsp/PitchyMpmAdapter";
import { YinBackupAdapter } from "../dsp/YinBackupAdapter";
import { createSessionExport, type ValidationSessionExport } from "../export/SessionExporter";
import { analyzeAttempt } from "../validation/AttemptAnalyzer";
import { ValidationSession } from "../validation/ValidationSession";
import type {
  CalibrationSummary,
  EndpointType,
  PhonationTag,
  ValidationContext,
} from "../validation/types";
import { generateVocalLikeSamples } from "./VocalLikeFixtures";

const SAMPLE_RATE = 48_000;
const FRAME_SIZE = 4096;
const CADENCE_HZ = 20;
const HOP_SIZE = SAMPLE_RATE / CADENCE_HZ;
const WINDOW_MS = 3000;
const FRAME_COUNT = WINDOW_MS / (1000 / CADENCE_HZ) + 1;

export function runValidationSimulation(): ValidationSessionExport {
  const runner = new ABRunner({
    pitchy: new PitchyMpmAdapter(FRAME_SIZE),
    yin: new YinBackupAdapter(FRAME_SIZE),
  });
  runner.beginNoiseCalibration();
  const calibrationNoise = deterministicNoiseFrame();
  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    runner.processFrame(
      calibrationNoise,
      SAMPLE_RATE,
      frameIndex * (1000 / CADENCE_HZ),
      true,
    );
  }
  const noiseFloorRms = runner.finishNoiseCalibration();
  runner.resetStability();

  const context: ValidationContext = {
    sessionId: "simulated-session-001",
    testerId: "SIM-001",
    createdAt: "2026-08-09T08:00:00.000Z",
    environment: {
      os: "Simulated OS",
      browser: "Node simulation",
      device: "Synthetic vocal source",
      userAgent: "vocal-range-validation-simulator/1",
    },
    sampleRate: SAMPLE_RATE,
    frameSize: FRAME_SIZE,
    cadenceHz: CADENCE_HZ,
    trackSettings: { sampleRate: SAMPLE_RATE, channelCount: 1 },
    simulated: true,
  };
  const session = new ValidationSession(context);
  let attemptStartMs = 4000;
  let seed = 700;

  addSimulatedAttempt(session, runner, {
    endpoint: "lowest",
    frequencyHz: null,
    profile: "fry",
    startedAtMs: attemptStartMs,
    seed: seed++,
  });
  attemptStartMs += 4000;

  for (let index = 0; index < 3; index += 1) {
    addSimulatedAttempt(session, runner, {
      endpoint: "lowest",
      frequencyHz: 110,
      profile: "modal",
      startedAtMs: attemptStartMs,
      seed: seed++,
    });
    attemptStartMs += 4000;
  }
  for (let index = 0; index < 3; index += 1) {
    addSimulatedAttempt(session, runner, {
      endpoint: "highest",
      frequencyHz: 440,
      profile: "head-falsetto",
      startedAtMs: attemptStartMs,
      seed: seed++,
    });
    attemptStartMs += 4000;
  }

  const calibration: CalibrationSummary = {
    durationMs: WINDOW_MS,
    frameCount: FRAME_COUNT,
    noiseFloorRms,
    sampleRate: SAMPLE_RATE,
  };
  return createSessionExport(session, calibration, "2026-08-09T08:01:00.000Z");
}

interface SimulatedAttemptOptions {
  endpoint: EndpointType;
  frequencyHz: number | null;
  profile: PhonationTag;
  startedAtMs: number;
  seed: number;
}

function addSimulatedAttempt(
  session: ValidationSession,
  runner: ABRunner,
  options: SimulatedAttemptOptions,
): void {
  if (session.currentEndpoint !== options.endpoint) {
    throw new Error(`Simulation expected ${session.currentEndpoint}, received ${options.endpoint}`);
  }
  runner.resetStability();
  const samples = options.frequencyHz === null
    ? new Float32Array(FRAME_SIZE + HOP_SIZE * (FRAME_COUNT - 1))
    : generateVocalLikeSamples({
      profile: options.profile,
      frequencyHz: options.frequencyHz,
      sampleRate: SAMPLE_RATE,
      length: FRAME_SIZE + HOP_SIZE * (FRAME_COUNT - 1),
      seed: options.seed,
    });
  const observations = [];
  for (let frameIndex = 0; frameIndex < FRAME_COUNT; frameIndex += 1) {
    const offset = frameIndex * HOP_SIZE;
    const frame = samples.slice(offset, offset + FRAME_SIZE);
    observations.push(runner.processFrame(
      frame,
      SAMPLE_RATE,
      options.startedAtMs + frameIndex * (1000 / CADENCE_HZ),
    ));
  }
  const result = analyzeAttempt({
    observations,
    startedAtMs: options.startedAtMs,
    endedAtMs: options.startedAtMs + WINDOW_MS,
    completed: true,
    endpoint: options.endpoint,
    endpointAttemptNumber: session.nextEndpointAttemptNumber(),
    tags: [options.profile],
    context: session.context,
  });
  session.addAttempt(result);
}

function deterministicNoiseFrame(): Float32Array {
  let state = 0x51f15e;
  return Float32Array.from({ length: FRAME_SIZE }, () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return (((state / 4_294_967_296) * 2) - 1) * 0.0005;
  });
}
