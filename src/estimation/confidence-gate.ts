import type { ConfidenceGateConfig } from "../config.js";
import type {
  ArticulationMeasurement,
  MeasurementGateResult,
} from "../types/measurements.js";

export class ConfidenceGate {
  constructor(private readonly config: ConfidenceGateConfig) {}

  evaluate(
    measurement: ArticulationMeasurement | undefined,
  ): MeasurementGateResult {
    if (measurement === undefined) {
      return { accepted: false, reason: "missing" };
    }

    if (
      !Number.isFinite(measurement.articulationRate) ||
      !Number.isFinite(measurement.confidence) ||
      !Number.isFinite(measurement.activeSpeechDuration) ||
      !Number.isFinite(measurement.ageSeconds)
    ) {
      return { accepted: false, reason: "non_finite", measurement };
    }
    if (measurement.candidateCount < this.config.minimumCandidates) {
      return { accepted: false, reason: "too_few_candidates", measurement };
    }
    if (
      measurement.activeSpeechDuration < this.config.minimumActiveSpeechSeconds
    ) {
      return { accepted: false, reason: "too_little_speech", measurement };
    }
    if (measurement.confidence < this.config.minimumConfidence) {
      return { accepted: false, reason: "low_confidence", measurement };
    }
    if (measurement.ageSeconds > this.config.maximumEvidenceAgeSeconds) {
      return { accepted: false, reason: "stale", measurement };
    }
    if (
      measurement.articulationRate <
      this.config.minimumPlausibleArticulationRate
    ) {
      return { accepted: false, reason: "implausibly_slow", measurement };
    }
    if (
      measurement.articulationRate >
      this.config.maximumPlausibleArticulationRate
    ) {
      return { accepted: false, reason: "implausibly_fast", measurement };
    }

    return { accepted: true, measurement };
  }
}
