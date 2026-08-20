import { DEFAULT_CONTROLLER_CONFIG } from "../config.js";
import { ArticulationEstimator } from "../estimation/articulation-estimator.js";
import { ConfidenceGate } from "../estimation/confidence-gate.js";
import type {
  ArticulationMeasurement,
  MeasurementRejectionReason,
} from "../types/measurements.js";
import type { AudioAnalysisFrame } from "./audio-frame.js";
import { SpeechDetector } from "./speech-detector.js";
import { SyllableDetector } from "./syllable-detector.js";

export interface SpeechAnalysisSnapshot {
  readonly frames: number;
  readonly speechActive: boolean;
  readonly speechProbability: number;
  readonly noiseFloorDb: number;
  readonly syllablesDetected: number;
  readonly lastProminenceDb: number | undefined;
  readonly measurement: ArticulationMeasurement | undefined;
  readonly accepted: boolean;
  readonly rejectionReason: MeasurementRejectionReason | undefined;
}

export class SpeechAnalysisPipeline {
  private readonly speechDetector = new SpeechDetector();
  private readonly syllableDetector = new SyllableDetector();
  private readonly estimator = new ArticulationEstimator();
  private readonly gate = new ConfidenceGate(DEFAULT_CONTROLLER_CONFIG.gate);
  private latestSnapshot: SpeechAnalysisSnapshot = emptySnapshot();
  private lastMediaTime: number | undefined;
  private analysisWindowSeconds =
    DEFAULT_CONTROLLER_CONFIG.analysisWindowSeconds;

  process(frame: AudioAnalysisFrame): SpeechAnalysisSnapshot {
    if (
      this.lastMediaTime !== undefined &&
      (frame.mediaTimeStart < this.lastMediaTime - 0.02 ||
        frame.mediaTimeStart - this.lastMediaTime > 0.75)
    ) {
      this.reset();
    }

    const speech = this.speechDetector.process(frame);
    if (speech.active) {
      this.estimator.addSpeechInterval({
        mediaTimeStart: frame.mediaTimeStart,
        mediaTimeEnd: frame.mediaTimeEnd,
        confidence: Math.max(0.65, speech.speechProbability),
      });
    }

    const nucleus = this.syllableDetector.process(frame, speech);
    if (nucleus !== undefined) {
      this.estimator.addSyllable({
        mediaTime: nucleus.mediaTime,
        confidence: nucleus.confidence,
      });
    }

    const measurement = this.estimator.measure(
      frame.mediaTimeEnd,
      this.analysisWindowSeconds,
    );
    const gate = this.gate.evaluate(measurement);
    this.lastMediaTime = frame.mediaTimeEnd;
    this.latestSnapshot = {
      frames: this.latestSnapshot.frames + 1,
      speechActive: speech.active,
      speechProbability: speech.speechProbability,
      noiseFloorDb: speech.noiseFloorDb,
      syllablesDetected:
        this.latestSnapshot.syllablesDetected + (nucleus === undefined ? 0 : 1),
      lastProminenceDb:
        nucleus?.prominenceDb ?? this.latestSnapshot.lastProminenceDb,
      measurement,
      accepted: gate.accepted,
      rejectionReason: gate.accepted ? undefined : gate.reason,
    };
    return this.latestSnapshot;
  }

  snapshot(): SpeechAnalysisSnapshot {
    return this.latestSnapshot;
  }

  setAnalysisWindowSeconds(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError("analysis window must be finite and positive");
    }
    if (value === this.analysisWindowSeconds) return;
    this.analysisWindowSeconds = value;
    this.reset();
  }

  reset(): void {
    this.speechDetector.reset();
    this.syllableDetector.reset();
    this.estimator.reset();
    this.latestSnapshot = emptySnapshot();
    this.lastMediaTime = undefined;
  }
}

function emptySnapshot(): SpeechAnalysisSnapshot {
  return {
    frames: 0,
    speechActive: false,
    speechProbability: 0,
    noiseFloorDb: -65,
    syllablesDetected: 0,
    lastProminenceDb: undefined,
    measurement: undefined,
    accepted: false,
    rejectionReason: "missing",
  };
}
