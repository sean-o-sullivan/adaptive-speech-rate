export {
  DEFAULT_CONTROLLER_CONFIG,
  DEFAULT_ESTIMATOR_CONFIG,
  validateControllerConfig,
} from "./config.js";
export type {
  ConfidenceGateConfig,
  ControllerConfig,
  EstimatorConfig,
  FilterConfig,
} from "./config.js";
export {
  AdaptiveController,
  type ControllerOutput,
  type ControllerTickInput,
} from "./control/adaptive-controller.js";
export type { AudioAnalysisFrame } from "./audio/audio-frame.js";
export {
  SpeechAnalysisPipeline,
  type SpeechAnalysisSnapshot,
} from "./audio/speech-analysis-pipeline.js";
export {
  DEFAULT_SPEECH_DETECTOR_CONFIG,
  SpeechDetector,
  type SpeechDetection,
  type SpeechDetectorConfig,
} from "./audio/speech-detector.js";
export {
  DEFAULT_SYLLABLE_DETECTOR_CONFIG,
  SyllableDetector,
  type SyllableDetectorConfig,
  type SyllableNucleus,
} from "./audio/syllable-detector.js";
export { ControllerState } from "./control/controller-state.js";
export { limitPlaybackRate, type RateLimit } from "./control/rate-limiter.js";
export { ArticulationEstimator } from "./estimation/articulation-estimator.js";
export { ConfidenceGate } from "./estimation/confidence-gate.js";
export { EventBuffer, type EventWindow } from "./estimation/event-buffer.js";
export { RobustRateFilter } from "./estimation/robust-rate-filter.js";
export type {
  ArticulationMeasurement,
  MeasurementGateResult,
  MeasurementRejectionReason,
  SpeechInterval,
  SyllableEvent,
} from "./types/measurements.js";
