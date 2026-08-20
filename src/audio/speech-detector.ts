import type { AudioAnalysisFrame } from "./audio-frame.js";

export interface SpeechDetectorConfig {
  readonly attackSourceSeconds: number;
  readonly releaseSourceSeconds: number;
  readonly attackProbability: number;
  readonly releaseProbability: number;
}

export interface SpeechDetection {
  readonly speechProbability: number;
  readonly active: boolean;
  readonly energyDb: number;
  readonly noiseFloorDb: number;
}

export const DEFAULT_SPEECH_DETECTOR_CONFIG: SpeechDetectorConfig = {
  attackSourceSeconds: 0.035,
  releaseSourceSeconds: 0.14,
  attackProbability: 0.62,
  releaseProbability: 0.32,
};

export class SpeechDetector {
  private noiseFloorDb = -65;
  private active = false;
  private attackDuration = 0;
  private releaseDuration = 0;

  constructor(
    private readonly config: SpeechDetectorConfig =
      DEFAULT_SPEECH_DETECTOR_CONFIG,
  ) {}

  process(frame: AudioAnalysisFrame): SpeechDetection {
    const energyDb = amplitudeToDb(frame.rms);
    const marginDb = energyDb - this.noiseFloorDb;
    const aboveNoiseProbability = clamp((marginDb - 3) / 15, 0, 1);
    const absoluteEnergyProbability = clamp((energyDb + 58) / 28, 0, 1);
    const excessiveCrossingPenalty =
      frame.zeroCrossingRate <= 0.4
        ? 1
        : clamp(1 - (frame.zeroCrossingRate - 0.4) / 0.35, 0.4, 1);
    const speechProbability =
      Math.sqrt(aboveNoiseProbability * absoluteEnergyProbability) *
      excessiveCrossingPenalty;

    const noiseTimeConstant = energyDb < this.noiseFloorDb ? 0.8 : 8;
    const noiseAlpha = 1 - Math.exp(-frame.sourceDurationSeconds / noiseTimeConstant);
    if (!this.active || speechProbability < this.config.releaseProbability) {
      this.noiseFloorDb += noiseAlpha * (energyDb - this.noiseFloorDb);
      this.noiseFloorDb = clamp(this.noiseFloorDb, -100, -25);
    }

    if (this.active) {
      if (speechProbability < this.config.releaseProbability) {
        this.releaseDuration += frame.sourceDurationSeconds;
        if (this.releaseDuration >= this.config.releaseSourceSeconds) {
          this.active = false;
          this.attackDuration = 0;
        }
      } else {
        this.releaseDuration = 0;
      }
    } else if (speechProbability >= this.config.attackProbability) {
      this.attackDuration += frame.sourceDurationSeconds;
      if (this.attackDuration >= this.config.attackSourceSeconds) {
        this.active = true;
        this.releaseDuration = 0;
      }
    } else {
      this.attackDuration = 0;
    }

    return {
      speechProbability,
      active: this.active,
      energyDb,
      noiseFloorDb: this.noiseFloorDb,
    };
  }

  reset(): void {
    this.noiseFloorDb = -65;
    this.active = false;
    this.attackDuration = 0;
    this.releaseDuration = 0;
  }
}

function amplitudeToDb(amplitude: number): number {
  return amplitude <= 1e-6 ? -120 : 20 * Math.log10(amplitude);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
