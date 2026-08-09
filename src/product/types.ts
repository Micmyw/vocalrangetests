export type EndpointKind = "lowest" | "highest";

export interface CapturedEndpoint {
  frequencyHz: number;
  midi: number;
  note: string;
  cents: number;
}

export interface VocalRangeResult {
  lowest: CapturedEndpoint;
  highest: CapturedEndpoint;
  semitoneSpan: number;
  octaveSpan: number;
}

export type VocalRangePhase =
  | "intro"
  | "requesting-permission"
  | "calibrating"
  | "lowest-ready"
  | "lowest-capturing"
  | "lowest-success"
  | "highest-ready"
  | "highest-capturing"
  | "highest-success"
  | "result"
  | "recoverable-error";

