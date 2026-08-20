import {
  DEFAULT_ESTIMATOR_CONFIG,
  type EstimatorConfig,
} from "../config.js";
import type {
  ArticulationMeasurement,
  SpeechInterval,
  SyllableEvent,
} from "../types/measurements.js";
import { EventBuffer } from "./event-buffer.js";

interface SpeechEvidence {
  readonly activeDuration: number;
  readonly averageConfidence: number;
  readonly latestMediaTime: number | undefined;
}

export class ArticulationEstimator {
  private readonly buffer = new EventBuffer();

  constructor(private readonly config: EstimatorConfig = DEFAULT_ESTIMATOR_CONFIG) {
    if (!Number.isFinite(config.retentionSeconds) || config.retentionSeconds <= 0) {
      throw new RangeError("retentionSeconds must be finite and positive");
    }
  }

  addSyllable(event: SyllableEvent): void {
    this.buffer.addSyllable(event);
  }

  addSpeechInterval(interval: SpeechInterval): void {
    this.buffer.addSpeechInterval(interval);
  }

  measure(
    currentMediaTime: number,
    analysisWindowSeconds: number,
  ): ArticulationMeasurement | undefined {
    if (!Number.isFinite(currentMediaTime) || currentMediaTime < 0) {
      throw new RangeError("currentMediaTime must be finite and non-negative");
    }
    if (!Number.isFinite(analysisWindowSeconds) || analysisWindowSeconds <= 0) {
      throw new RangeError("analysisWindowSeconds must be finite and positive");
    }

    this.buffer.pruneBefore(currentMediaTime - this.config.retentionSeconds);
    const windowStart = Math.max(0, currentMediaTime - analysisWindowSeconds);
    const window = this.buffer.window(windowStart, currentMediaTime);
    const speech = calculateSpeechEvidence(window.speechIntervals);

    if (speech.activeDuration === 0 || window.syllables.length === 0) {
      return undefined;
    }

    const syllableCount = window.syllables.reduce(
      (sum, event) => sum + event.confidence,
      0,
    );
    const eventConfidence = syllableCount / window.syllables.length;
    const latestSyllableMediaTime = Math.max(
      ...window.syllables.map((event) => event.mediaTime),
    );
    const latestEvidenceMediaTime = Math.max(
      latestSyllableMediaTime,
      speech.latestMediaTime ?? latestSyllableMediaTime,
    );

    return {
      mediaTime: currentMediaTime,
      articulationRate: syllableCount / speech.activeDuration,
      confidence: Math.min(eventConfidence, speech.averageConfidence),
      activeSpeechDuration: speech.activeDuration,
      syllableCount,
      candidateCount: window.syllables.length,
      ageSeconds: Math.max(0, currentMediaTime - latestEvidenceMediaTime),
    };
  }

  reset(): void {
    this.buffer.clear();
  }
}

function calculateSpeechEvidence(
  intervals: readonly SpeechInterval[],
): SpeechEvidence {
  if (intervals.length === 0) {
    return {
      activeDuration: 0,
      averageConfidence: 0,
      latestMediaTime: undefined,
    };
  }

  const boundaries = Array.from(
    new Set(
      intervals.flatMap((interval) => [
        interval.mediaTimeStart,
        interval.mediaTimeEnd,
      ]),
    ),
  ).sort((left, right) => left - right);

  let activeDuration = 0;
  let confidenceDuration = 0;

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (start === undefined || end === undefined) continue;

    const confidence = intervals.reduce(
      (maximum, interval) =>
        interval.mediaTimeStart < end && interval.mediaTimeEnd > start
          ? Math.max(maximum, interval.confidence)
          : maximum,
      0,
    );
    if (confidence === 0) continue;

    const duration = end - start;
    activeDuration += duration;
    confidenceDuration += duration * confidence;
  }

  return {
    activeDuration,
    averageConfidence:
      activeDuration === 0 ? 0 : confidenceDuration / activeDuration,
    latestMediaTime: Math.max(...intervals.map((interval) => interval.mediaTimeEnd)),
  };
}
