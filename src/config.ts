export interface EstimatorConfig {
  readonly retentionSeconds: number;
}

export interface ConfidenceGateConfig {
  readonly minimumCandidates: number;
  readonly minimumActiveSpeechSeconds: number;
  readonly minimumConfidence: number;
  readonly maximumEvidenceAgeSeconds: number;
  readonly minimumPlausibleArticulationRate: number;
  readonly maximumPlausibleArticulationRate: number;
}

export interface FilterConfig {
  readonly medianHistoryLength: number;
  readonly emaAlpha: number;
}

export interface ControllerConfig {
  readonly targetSyllablesPerSecond: number;
  readonly analysisWindowSeconds: number;
  readonly minimumPlaybackRate: number;
  readonly maximumPlaybackRate: number;
  readonly relativeDeadband: number;
  readonly maximumAccelerationPerWallSecond: number;
  readonly maximumDecelerationPerWallSecond: number;
  readonly gate: ConfidenceGateConfig;
  readonly filter: FilterConfig;
}

export const DEFAULT_ESTIMATOR_CONFIG: EstimatorConfig = {
  retentionSeconds: 30,
};

export const DEFAULT_CONTROLLER_CONFIG: ControllerConfig = {
  targetSyllablesPerSecond: 8,
  analysisWindowSeconds: 4,
  minimumPlaybackRate: 0.8,
  maximumPlaybackRate: 3.25,
  relativeDeadband: 0.05,
  maximumAccelerationPerWallSecond: 0.25,
  maximumDecelerationPerWallSecond: 0.4,
  gate: {
    minimumCandidates: 3,
    minimumActiveSpeechSeconds: 0.75,
    minimumConfidence: 0.6,
    maximumEvidenceAgeSeconds: 1.25,
    minimumPlausibleArticulationRate: 1,
    maximumPlausibleArticulationRate: 12,
  },
  filter: {
    medianHistoryLength: 5,
    emaAlpha: 0.22,
  },
};

export function validateControllerConfig(config: ControllerConfig): void {
  const positiveValues: ReadonlyArray<readonly [string, number]> = [
    ["targetSyllablesPerSecond", config.targetSyllablesPerSecond],
    ["analysisWindowSeconds", config.analysisWindowSeconds],
    ["minimumPlaybackRate", config.minimumPlaybackRate],
    ["maximumPlaybackRate", config.maximumPlaybackRate],
    ["maximumAccelerationPerWallSecond", config.maximumAccelerationPerWallSecond],
    ["maximumDecelerationPerWallSecond", config.maximumDecelerationPerWallSecond],
    ["gate.minimumActiveSpeechSeconds", config.gate.minimumActiveSpeechSeconds],
    ["gate.maximumEvidenceAgeSeconds", config.gate.maximumEvidenceAgeSeconds],
    [
      "gate.minimumPlausibleArticulationRate",
      config.gate.minimumPlausibleArticulationRate,
    ],
    [
      "gate.maximumPlausibleArticulationRate",
      config.gate.maximumPlausibleArticulationRate,
    ],
  ];

  for (const [name, value] of positiveValues) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be finite and positive`);
    }
  }

  if (config.minimumPlaybackRate > config.maximumPlaybackRate) {
    throw new RangeError("minimumPlaybackRate must not exceed maximumPlaybackRate");
  }
  if (config.relativeDeadband < 0 || config.relativeDeadband >= 1) {
    throw new RangeError("relativeDeadband must be in [0, 1)");
  }
  if (config.gate.minimumCandidates < 1) {
    throw new RangeError("gate.minimumCandidates must be at least 1");
  }
  if (
    config.gate.minimumConfidence < 0 ||
    config.gate.minimumConfidence > 1
  ) {
    throw new RangeError("gate.minimumConfidence must be in [0, 1]");
  }
  if (
    config.gate.minimumPlausibleArticulationRate >=
    config.gate.maximumPlausibleArticulationRate
  ) {
    throw new RangeError("plausible articulation-rate bounds must increase");
  }
  if (
    !Number.isInteger(config.filter.medianHistoryLength) ||
    config.filter.medianHistoryLength < 1 ||
    config.filter.medianHistoryLength % 2 === 0
  ) {
    throw new RangeError("filter.medianHistoryLength must be a positive odd integer");
  }
  if (config.filter.emaAlpha <= 0 || config.filter.emaAlpha > 1) {
    throw new RangeError("filter.emaAlpha must be in (0, 1]");
  }
}
