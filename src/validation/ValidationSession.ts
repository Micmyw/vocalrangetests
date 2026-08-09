import { percentile } from "../benchmark/metrics";
import type {
  AttemptResult,
  DetectorId,
  DetectorSessionSummary,
  EndpointSummary,
  EndpointType,
  ValidationContext,
  ValidationSessionSummary,
} from "./types";

const REQUIRED_SUCCESSFUL_CAPTURES = 3;

export class ValidationSession {
  readonly context: ValidationContext;
  private records: AttemptResult[] = [];

  constructor(context: ValidationContext) {
    this.context = context;
  }

  get attempts(): readonly AttemptResult[] {
    return this.records;
  }

  get currentEndpoint(): EndpointType {
    return this.successfulCount("lowest") >= REQUIRED_SUCCESSFUL_CAPTURES
      ? "highest"
      : "lowest";
  }

  get isComplete(): boolean {
    return this.successfulCount("lowest") >= REQUIRED_SUCCESSFUL_CAPTURES &&
      this.successfulCount("highest") >= REQUIRED_SUCCESSFUL_CAPTURES;
  }

  get retryCount(): number {
    return this.records.filter((attempt) => attempt.completed && !attempt.pitchy.success).length;
  }

  successfulCount(endpoint: EndpointType): number {
    return this.records.filter(
      (attempt) => attempt.endpoint === endpoint && attempt.completed && attempt.pitchy.success,
    ).length;
  }

  nextEndpointAttemptNumber(endpoint = this.currentEndpoint): number {
    return this.records.filter((attempt) => attempt.endpoint === endpoint).length + 1;
  }

  addAttempt(attempt: AttemptResult): void {
    if (attempt.context.sessionId !== this.context.sessionId) {
      throw new Error("Attempt session does not match this validation session");
    }
    if (this.isComplete) throw new Error("Validation session is already complete");
    if (attempt.endpoint !== this.currentEndpoint) {
      throw new Error(`Expected a ${this.currentEndpoint} attempt`);
    }
    this.records.push(attempt);
  }

  buildSummary(): ValidationSessionSummary {
    const frameComparison = summarizeFrameOctaveDisagreements(this.records);
    return {
      attemptCount: this.records.length,
      retryCount: this.retryCount,
      octaveDisagreementCount: this.records.filter(hasOctaveDisagreement).length,
      frameComparisonCount: frameComparison.comparisonCount,
      frameOctaveDisagreementCount: frameComparison.disagreementCount,
      frameOctaveDisagreementRate: rate(
        frameComparison.disagreementCount,
        frameComparison.comparisonCount,
      ),
      pitchy: this.detectorSummary("pitchy"),
      yin: this.detectorSummary("yin"),
      endpoints: {
        lowest: this.endpointSummary("lowest"),
        highest: this.endpointSummary("highest"),
      },
    };
  }

  private endpointSummary(endpoint: EndpointType): EndpointSummary {
    const attempts = this.records.filter((attempt) => attempt.endpoint === endpoint);
    const accepted = attempts.filter(
      (attempt) => attempt.completed && attempt.pitchy.success &&
        attempt.pitchy.midi !== null && attempt.pitchy.note !== null,
    ).slice(0, REQUIRED_SUCCESSFUL_CAPTURES);
    const completed = accepted.length === REQUIRED_SUCCESSFUL_CAPTURES;
    const midi = accepted.map((attempt) => attempt.pitchy.midi!);
    const maximumSemitoneDifference = completed
      ? Math.max(...midi) - Math.min(...midi)
      : null;
    return {
      endpoint,
      completed,
      attemptCount: attempts.length,
      successfulPitchyCaptures: accepted.length,
      notes: accepted.map((attempt) => attempt.pitchy.note!),
      midi,
      maximumSemitoneDifference,
      repeatableWithinOneSemitone: maximumSemitoneDifference === null
        ? null
        : maximumSemitoneDifference <= 1,
      pitchySuccessRate: rate(attempts.filter((attempt) => attempt.pitchy.success).length, attempts.length),
      yinSuccessRate: rate(attempts.filter((attempt) => attempt.yin.success).length, attempts.length),
    };
  }

  private detectorSummary(detector: DetectorId): DetectorSessionSummary {
    const results = this.records.map((attempt) => attempt[detector]);
    const processingTimes = this.records.flatMap((attempt) =>
      attempt.observations.map((observation) => observation[detector].processingTimeMs),
    );
    const fallbackTimes = results.map((result) => result.processingTimeP95Ms);
    const times = processingTimes.length > 0 ? processingTimes : fallbackTimes;
    return {
      successCount: results.filter((result) => result.success).length,
      successRate: rate(results.filter((result) => result.success).length, results.length),
      noDetectionCount: results.filter((result) => result.noDetection).length,
      noDetectionRate: rate(results.filter((result) => result.noDetection).length, results.length),
      octaveAmbiguityCount: results.filter((result) => result.octaveAmbiguous).length,
      processingTimeP50Ms: times.length > 0 ? percentile(times, 0.5) : 0,
      processingTimeP95Ms: times.length > 0 ? percentile(times, 0.95) : 0,
    };
  }
}

function summarizeFrameOctaveDisagreements(attempts: readonly AttemptResult[]): {
  comparisonCount: number;
  disagreementCount: number;
} {
  let comparisonCount = 0;
  let disagreementCount = 0;
  for (const attempt of attempts) {
    for (const observation of attempt.observations) {
      const pitchy = observation.pitchy.estimate;
      const yin = observation.yin.estimate;
      if (
        observation.signal.state !== "usable" ||
        pitchy === null || yin === null ||
        pitchy.confidence < 0.75 || yin.confidence < 0.75 ||
        !Number.isFinite(pitchy.frequencyHz) || !Number.isFinite(yin.frequencyHz) ||
        pitchy.frequencyHz <= 0 || yin.frequencyHz <= 0
      ) continue;
      comparisonCount += 1;
      const cents = Math.abs(1200 * Math.log2(pitchy.frequencyHz / yin.frequencyHz));
      if (cents >= 1_100 && cents <= 1_300) disagreementCount += 1;
    }
  }
  return { comparisonCount, disagreementCount };
}

function hasOctaveDisagreement(attempt: AttemptResult): boolean {
  if (
    !attempt.pitchy.success || !attempt.yin.success ||
    attempt.pitchy.midi === null || attempt.yin.midi === null
  ) return false;
  const semitoneDifference = Math.abs(attempt.pitchy.midi - attempt.yin.midi);
  return semitoneDifference >= 11 && semitoneDifference <= 13;
}

function rate(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}
