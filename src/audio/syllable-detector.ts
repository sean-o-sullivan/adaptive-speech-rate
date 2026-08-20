import type { AudioAnalysisFrame } from "./audio-frame.js";
import type { SpeechDetection } from "./speech-detector.js";

export interface SyllableDetectorConfig {
  readonly envelopeTimeConstantSourceSeconds: number;
  readonly minimumProminenceDb: number;
  readonly refractorySourceSeconds: number;
}

export interface SyllableNucleus {
  readonly mediaTime: number;
  readonly confidence: number;
  readonly prominenceDb: number;
}

export const DEFAULT_SYLLABLE_DETECTOR_CONFIG: SyllableDetectorConfig = {
  envelopeTimeConstantSourceSeconds: 0.025,
  minimumProminenceDb: 1.8,
  refractorySourceSeconds: 0.09,
};

export class SyllableDetector {
  private smoothedEnergyDb: number | undefined;
  private previousEnergyDb: number | undefined;
  private previousMediaTime: number | undefined;
  private valleyDb: number | undefined;
  private risingPeak: { readonly energyDb: number; readonly mediaTime: number } | undefined;
  private lastNucleusMediaTime = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly config: SyllableDetectorConfig =
      DEFAULT_SYLLABLE_DETECTOR_CONFIG,
  ) {}

  process(
    frame: AudioAnalysisFrame,
    speech: SpeechDetection,
  ): SyllableNucleus | undefined {
    if (!speech.active) {
      this.resetEnvelope();
      return undefined;
    }

    const alpha =
      1 -
      Math.exp(
        -frame.sourceDurationSeconds /
          this.config.envelopeTimeConstantSourceSeconds,
      );
    this.smoothedEnergyDb =
      this.smoothedEnergyDb === undefined
        ? speech.energyDb
        : this.smoothedEnergyDb + alpha * (speech.energyDb - this.smoothedEnergyDb);

    const currentEnergyDb = this.smoothedEnergyDb;
    const currentMediaTime = (frame.mediaTimeStart + frame.mediaTimeEnd) / 2;
    const previousEnergyDb = this.previousEnergyDb;
    const previousMediaTime = this.previousMediaTime;

    this.valleyDb =
      this.valleyDb === undefined
        ? currentEnergyDb
        : Math.min(this.valleyDb, currentEnergyDb);

    let nucleus: SyllableNucleus | undefined;
    if (
      previousEnergyDb !== undefined &&
      previousMediaTime !== undefined &&
      currentEnergyDb > previousEnergyDb
    ) {
      this.risingPeak = {
        energyDb: currentEnergyDb,
        mediaTime: currentMediaTime,
      };
    } else if (
      previousEnergyDb !== undefined &&
      currentEnergyDb < previousEnergyDb &&
      this.risingPeak !== undefined
    ) {
      const prominenceDb = this.risingPeak.energyDb - this.valleyDb;
      const outsideRefractory =
        this.risingPeak.mediaTime - this.lastNucleusMediaTime >=
        this.config.refractorySourceSeconds;
      if (
        prominenceDb >= this.config.minimumProminenceDb &&
        outsideRefractory
      ) {
        const prominenceConfidence = clamp(
          prominenceDb / (this.config.minimumProminenceDb * 3),
          0,
          1,
        );
        nucleus = {
          mediaTime: this.risingPeak.mediaTime,
          confidence: clamp(
            0.65 +
              0.2 * prominenceConfidence +
              0.15 * speech.speechProbability,
            0,
            1,
          ),
          prominenceDb,
        };
        this.lastNucleusMediaTime = this.risingPeak.mediaTime;
        this.valleyDb = currentEnergyDb;
      }
      this.risingPeak = undefined;
    }

    this.previousEnergyDb = currentEnergyDb;
    this.previousMediaTime = currentMediaTime;
    return nucleus;
  }

  reset(): void {
    this.resetEnvelope();
    this.lastNucleusMediaTime = Number.NEGATIVE_INFINITY;
  }

  private resetEnvelope(): void {
    this.smoothedEnergyDb = undefined;
    this.previousEnergyDb = undefined;
    this.previousMediaTime = undefined;
    this.valleyDb = undefined;
    this.risingPeak = undefined;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
