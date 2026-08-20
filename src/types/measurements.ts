export interface SyllableEvent {
  readonly mediaTime: number;
  readonly confidence: number;
}

export interface SpeechInterval {
  readonly mediaTimeStart: number;
  readonly mediaTimeEnd: number;
  readonly confidence: number;
}

export interface ArticulationMeasurement {
  readonly mediaTime: number;
  readonly articulationRate: number;
  readonly confidence: number;
  readonly activeSpeechDuration: number;
  readonly syllableCount: number;
  readonly candidateCount: number;
  readonly ageSeconds: number;
}

export type MeasurementRejectionReason =
  | "missing"
  | "non_finite"
  | "too_few_candidates"
  | "too_little_speech"
  | "low_confidence"
  | "stale"
  | "implausibly_slow"
  | "implausibly_fast";

export type MeasurementGateResult =
  | { readonly accepted: true; readonly measurement: ArticulationMeasurement }
  | {
      readonly accepted: false;
      readonly reason: MeasurementRejectionReason;
      readonly measurement?: ArticulationMeasurement;
    };
