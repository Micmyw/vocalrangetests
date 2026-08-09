import type { PhonationTag } from "../validation/types";

export interface VocalLikeSamplesRequest {
  profile: PhonationTag;
  frequencyHz: number;
  sampleRate: number;
  length: number;
  seed: number;
}

export function generateVocalLikeSamples(request: VocalLikeSamplesRequest): Float32Array {
  validateRequest(request);
  if (request.profile === "fry") return generateFryLikeSamples(request);

  const samples = new Float32Array(request.length);
  const random = mulberry32(request.seed);
  const durationSeconds = request.length / request.sampleRate;
  let phase = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const timeSeconds = index / request.sampleRate;
    const instantaneousFrequency = frequencyFor(
      request.profile,
      request.frequencyHz,
      timeSeconds,
      durationSeconds,
    );
    phase += (2 * Math.PI * instantaneousFrequency) / request.sampleRate;
    samples[index] = clamp(sampleForProfile(request.profile, phase, random), -0.95, 0.95);
  }
  return samples;
}

function sampleForProfile(
  profile: Exclude<PhonationTag, "fry">,
  phase: number,
  random: () => number,
): number {
  if (profile === "head-falsetto") {
    return 0.56 * Math.sin(phase) +
      0.09 * Math.sin(2 * phase) +
      0.03 * Math.sin(3 * phase);
  }
  if (profile === "breathy") {
    const breathNoise = (random() * 2 - 1) * 0.13;
    return 0.34 * Math.sin(phase) +
      0.12 * Math.sin(2 * phase) +
      0.04 * Math.sin(3 * phase) +
      breathNoise;
  }
  return 0.46 * Math.sin(phase) +
    0.21 * Math.sin(2 * phase) +
    0.10 * Math.sin(3 * phase) +
    0.04 * Math.sin(4 * phase);
}

function frequencyFor(
  profile: Exclude<PhonationTag, "fry">,
  baseFrequencyHz: number,
  timeSeconds: number,
  durationSeconds: number,
): number {
  if (profile === "vibrato") {
    const cents = 50 * Math.sin(2 * Math.PI * 5 * timeSeconds);
    return baseFrequencyHz * 2 ** (cents / 1200);
  }
  if (profile === "glide") {
    const progress = durationSeconds > 0 ? timeSeconds / durationSeconds : 0;
    const cents = -100 + 200 * Math.max(0, Math.min(1, progress));
    return baseFrequencyHz * 2 ** (cents / 1200);
  }
  return baseFrequencyHz;
}

function generateFryLikeSamples(request: VocalLikeSamplesRequest): Float32Array {
  const samples = new Float32Array(request.length);
  const random = mulberry32(request.seed);
  const basePeriod = request.sampleRate / request.frequencyHz;
  let nextPulse = 0;
  let envelope = 0;
  let phase = 0;

  for (let index = 0; index < samples.length; index += 1) {
    if (index >= nextPulse) {
      envelope = 0.9;
      const jitter = 0.82 + random() * 0.36;
      nextPulse = index + Math.max(120, Math.round(basePeriod * jitter));
    }
    phase += (2 * Math.PI * request.frequencyHz) / request.sampleRate;
    const resonantTail = 0.08 * Math.sin(phase) * envelope;
    samples[index] = clamp(envelope + resonantTail, -0.95, 0.95);
    envelope *= 0.972;
  }
  return samples;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function validateRequest(request: VocalLikeSamplesRequest): void {
  if (!Number.isFinite(request.frequencyHz) || request.frequencyHz <= 0) {
    throw new Error("frequencyHz must be positive");
  }
  if (!Number.isFinite(request.sampleRate) || request.sampleRate <= 0) {
    throw new Error("sampleRate must be positive");
  }
  if (!Number.isInteger(request.length) || request.length <= 0) {
    throw new Error("length must be a positive integer");
  }
}
