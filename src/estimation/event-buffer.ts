import type { SpeechInterval, SyllableEvent } from "../types/measurements.js";

export interface EventWindow {
  readonly syllables: readonly SyllableEvent[];
  readonly speechIntervals: readonly SpeechInterval[];
}

export class EventBuffer {
  private syllables: SyllableEvent[] = [];
  private speechIntervals: SpeechInterval[] = [];

  addSyllable(event: SyllableEvent): void {
    assertFiniteNonNegative("event.mediaTime", event.mediaTime);
    assertProbability("event.confidence", event.confidence);
    this.syllables.push(event);
  }

  addSpeechInterval(interval: SpeechInterval): void {
    assertFiniteNonNegative("interval.mediaTimeStart", interval.mediaTimeStart);
    assertFiniteNonNegative("interval.mediaTimeEnd", interval.mediaTimeEnd);
    assertProbability("interval.confidence", interval.confidence);
    if (interval.mediaTimeEnd <= interval.mediaTimeStart) {
      throw new RangeError("speech interval must have positive duration");
    }
    this.speechIntervals.push(interval);
  }

  window(startMediaTime: number, endMediaTime: number): EventWindow {
    if (endMediaTime < startMediaTime) {
      throw new RangeError("window end must not precede window start");
    }

    return {
      syllables: this.syllables.filter(
        (event) => event.mediaTime > startMediaTime && event.mediaTime <= endMediaTime,
      ),
      speechIntervals: this.speechIntervals
        .filter(
          (interval) =>
            interval.mediaTimeEnd > startMediaTime &&
            interval.mediaTimeStart < endMediaTime,
        )
        .map((interval) => ({
          mediaTimeStart: Math.max(interval.mediaTimeStart, startMediaTime),
          mediaTimeEnd: Math.min(interval.mediaTimeEnd, endMediaTime),
          confidence: interval.confidence,
        })),
    };
  }

  pruneBefore(mediaTime: number): void {
    this.syllables = this.syllables.filter((event) => event.mediaTime > mediaTime);
    this.speechIntervals = this.speechIntervals.filter(
      (interval) => interval.mediaTimeEnd > mediaTime,
    );
  }

  clear(): void {
    this.syllables = [];
    this.speechIntervals = [];
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function assertProbability(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be in [0, 1]`);
  }
}
