import {
  DEFAULT_CONTROLLER_CONFIG,
  type ControllerConfig,
} from "../config.js";
import {
  AdaptiveController,
  type ControllerOutput,
} from "../control/adaptive-controller.js";
import { ArticulationEstimator } from "../estimation/articulation-estimator.js";
import type {
  ArticulationMeasurement,
  SyllableEvent,
} from "../types/measurements.js";

export type DetectionMode = "normal" | "dropout";

export interface ScenarioSegment {
  readonly label: string;
  readonly durationSeconds: number;
  readonly articulationRate?: number;
  readonly detectionMode?: DetectionMode;
  readonly confidence?: number;
}

export interface FalseDetectionBurst {
  readonly mediaTime: number;
  readonly candidateCount: number;
  readonly durationSeconds: number;
  readonly confidence?: number;
}

export interface SeekEvent {
  readonly wallTime: number;
  readonly destinationMediaTime: number;
}

export interface SimulationScenario {
  readonly name: string;
  readonly segments: readonly ScenarioSegment[];
  readonly falseDetectionBursts?: readonly FalseDetectionBurst[];
  readonly seeks?: readonly SeekEvent[];
}

export interface SimulationOptions {
  readonly controllerConfig?: ControllerConfig;
  readonly wallStepSeconds?: number;
  readonly initialPlaybackRate?: number;
  readonly maximumWallSeconds?: number;
}

export interface SimulationTracePoint {
  readonly wallTime: number;
  readonly mediaTime: number;
  readonly sourceSegment: string;
  readonly measurement: ArticulationMeasurement | undefined;
  readonly controller: ControllerOutput;
}

export interface SimulationResult {
  readonly scenario: string;
  readonly sourceDuration: number;
  readonly wallDuration: number;
  readonly trace: readonly SimulationTracePoint[];
}

interface TimelineSegment extends ScenarioSegment {
  readonly startMediaTime: number;
  readonly endMediaTime: number;
}

export function simulateScenario(
  scenario: SimulationScenario,
  options: SimulationOptions = {},
): SimulationResult {
  const config = options.controllerConfig ?? DEFAULT_CONTROLLER_CONFIG;
  const wallStepSeconds = options.wallStepSeconds ?? 0.1;
  const initialPlaybackRate = options.initialPlaybackRate ?? 1;
  const timeline = buildTimeline(scenario.segments);
  const sourceDuration = timeline.at(-1)?.endMediaTime ?? 0;
  const maximumWallSeconds =
    options.maximumWallSeconds ?? Math.max(60, sourceDuration * 2);

  if (sourceDuration <= 0) throw new RangeError("scenario must have positive duration");
  if (!Number.isFinite(wallStepSeconds) || wallStepSeconds <= 0) {
    throw new RangeError("wallStepSeconds must be finite and positive");
  }

  const candidates = buildCandidates(timeline, scenario.falseDetectionBursts ?? []);
  const estimator = new ArticulationEstimator();
  const controller = new AdaptiveController(config, initialPlaybackRate);
  const trace: SimulationTracePoint[] = [];
  const appliedSeeks = new Set<number>();

  let wallTime = 0;
  let mediaTime = 0;
  let playbackRate = initialPlaybackRate;
  let candidateIndex = 0;
  controller.enable(playbackRate, wallTime);

  while (mediaTime < sourceDuration && wallTime < maximumWallSeconds) {
    const seek = scenario.seeks?.find(
      (event, index) => event.wallTime <= wallTime && !appliedSeeks.has(index),
    );
    if (seek !== undefined) {
      const index = scenario.seeks?.indexOf(seek);
      if (index !== undefined && index >= 0) appliedSeeks.add(index);
      mediaTime = clamp(seek.destinationMediaTime, 0, sourceDuration);
      estimator.reset();
      controller.notifySeek();
      candidateIndex = firstCandidateAfter(candidates, mediaTime);
    }

    const previousMediaTime = mediaTime;
    wallTime += wallStepSeconds;
    mediaTime = Math.min(
      sourceDuration,
      mediaTime + playbackRate * wallStepSeconds,
    );

    ingestSpeechIntervals(estimator, timeline, previousMediaTime, mediaTime);
    while (candidateIndex < candidates.length) {
      const candidate = candidates[candidateIndex];
      if (candidate === undefined || candidate.mediaTime > mediaTime) break;
      if (candidate.mediaTime > previousMediaTime) {
        estimator.addSyllable(candidate);
      }
      candidateIndex += 1;
    }

    const measurement = estimator.measure(
      mediaTime,
      config.analysisWindowSeconds,
    );
    const output = controller.tick({
      wallTime,
      currentPlaybackRate: playbackRate,
      paused: false,
      ...(measurement === undefined ? {} : { measurement }),
    });
    playbackRate = output.commandedPlaybackRate;

    trace.push({
      wallTime,
      mediaTime,
      sourceSegment: segmentAt(timeline, mediaTime)?.label ?? "complete",
      measurement,
      controller: output,
    });
  }

  if (mediaTime < sourceDuration) {
    throw new Error(
      `scenario exceeded ${maximumWallSeconds}s wall-time safety limit at ${mediaTime.toFixed(2)}s media time`,
    );
  }

  return {
    scenario: scenario.name,
    sourceDuration,
    wallDuration: wallTime,
    trace,
  };
}

function buildTimeline(
  segments: readonly ScenarioSegment[],
): readonly TimelineSegment[] {
  let mediaTime = 0;
  return segments.map((segment) => {
    if (!Number.isFinite(segment.durationSeconds) || segment.durationSeconds <= 0) {
      throw new RangeError("segment duration must be finite and positive");
    }
    if (
      segment.articulationRate !== undefined &&
      (!Number.isFinite(segment.articulationRate) || segment.articulationRate <= 0)
    ) {
      throw new RangeError("articulation rate must be finite and positive");
    }

    const startMediaTime = mediaTime;
    mediaTime += segment.durationSeconds;
    return { ...segment, startMediaTime, endMediaTime: mediaTime };
  });
}

function buildCandidates(
  timeline: readonly TimelineSegment[],
  falseDetectionBursts: readonly FalseDetectionBurst[],
): readonly SyllableEvent[] {
  const candidates: SyllableEvent[] = [];

  for (const segment of timeline) {
    if (
      segment.articulationRate === undefined ||
      (segment.detectionMode ?? "normal") === "dropout"
    ) {
      continue;
    }

    const period = 1 / segment.articulationRate;
    for (
      let mediaTime = segment.startMediaTime + period / 2;
      mediaTime < segment.endMediaTime;
      mediaTime += period
    ) {
      candidates.push({
        mediaTime,
        confidence: segment.confidence ?? 1,
      });
    }
  }

  for (const burst of falseDetectionBursts) {
    if (burst.candidateCount < 1 || !Number.isInteger(burst.candidateCount)) {
      throw new RangeError("false burst candidateCount must be a positive integer");
    }
    if (burst.durationSeconds <= 0) {
      throw new RangeError("false burst durationSeconds must be positive");
    }
    const spacing = burst.durationSeconds / burst.candidateCount;
    for (let index = 0; index < burst.candidateCount; index += 1) {
      candidates.push({
        mediaTime: burst.mediaTime + spacing * index,
        confidence: burst.confidence ?? 1,
      });
    }
  }

  return candidates.sort((left, right) => left.mediaTime - right.mediaTime);
}

function ingestSpeechIntervals(
  estimator: ArticulationEstimator,
  timeline: readonly TimelineSegment[],
  startMediaTime: number,
  endMediaTime: number,
): void {
  for (const segment of timeline) {
    if (
      segment.articulationRate === undefined ||
      (segment.detectionMode ?? "normal") === "dropout"
    ) {
      continue;
    }
    const start = Math.max(startMediaTime, segment.startMediaTime);
    const end = Math.min(endMediaTime, segment.endMediaTime);
    if (end <= start) continue;

    estimator.addSpeechInterval({
      mediaTimeStart: start,
      mediaTimeEnd: end,
      confidence: segment.confidence ?? 1,
    });
  }
}

function segmentAt(
  timeline: readonly TimelineSegment[],
  mediaTime: number,
): TimelineSegment | undefined {
  return timeline.find(
    (segment) =>
      mediaTime >= segment.startMediaTime && mediaTime < segment.endMediaTime,
  );
}

function firstCandidateAfter(
  candidates: readonly SyllableEvent[],
  mediaTime: number,
): number {
  const index = candidates.findIndex((candidate) => candidate.mediaTime > mediaTime);
  return index === -1 ? candidates.length : index;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
