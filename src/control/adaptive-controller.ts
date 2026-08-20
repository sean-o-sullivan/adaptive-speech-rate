import {
  type ControllerConfig,
  validateControllerConfig,
} from "../config.js";
import { ConfidenceGate } from "../estimation/confidence-gate.js";
import { RobustRateFilter } from "../estimation/robust-rate-filter.js";
import type {
  ArticulationMeasurement,
  MeasurementRejectionReason,
} from "../types/measurements.js";
import { ControllerState } from "./controller-state.js";
import { limitPlaybackRate } from "./rate-limiter.js";

export interface ControllerTickInput {
  readonly wallTime: number;
  readonly currentPlaybackRate: number;
  readonly paused: boolean;
  readonly measurement?: ArticulationMeasurement;
}

export interface ControllerOutput {
  readonly state: ControllerState;
  readonly commandedPlaybackRate: number;
  readonly targetPlaybackRate: number;
  readonly filteredArticulationRate: number | undefined;
  readonly rejectionReason: MeasurementRejectionReason | undefined;
  readonly shouldApplyPlaybackRate: boolean;
}

export class AdaptiveController {
  private readonly gate: ConfidenceGate;
  private readonly filter: RobustRateFilter;
  private enabled = false;
  private currentState = ControllerState.Disabled;
  private targetPlaybackRate: number;
  private lastWallTime: number | undefined;
  private hasTrustedTarget = false;
  private recoveryState:
    | ControllerState.SeekRecovery
    | ControllerState.VideoChanged
    | undefined;
  private stateBeforePause = ControllerState.WarmingUp;

  constructor(
    private readonly config: ControllerConfig,
    initialPlaybackRate = 1,
  ) {
    validateControllerConfig(config);
    this.gate = new ConfidenceGate(config.gate);
    this.filter = new RobustRateFilter(config.filter);
    this.targetPlaybackRate = clamp(
      initialPlaybackRate,
      config.minimumPlaybackRate,
      config.maximumPlaybackRate,
    );
  }

  enable(currentPlaybackRate: number, wallTime: number): void {
    this.enabled = true;
    this.currentState = ControllerState.WarmingUp;
    this.stateBeforePause = ControllerState.WarmingUp;
    this.recoveryState = undefined;
    this.hasTrustedTarget = false;
    this.filter.reset();
    this.targetPlaybackRate = clamp(
      currentPlaybackRate,
      this.config.minimumPlaybackRate,
      this.config.maximumPlaybackRate,
    );
    this.lastWallTime = wallTime;
  }

  disable(currentPlaybackRate: number): void {
    this.enabled = false;
    this.currentState = ControllerState.Disabled;
    this.recoveryState = undefined;
    this.hasTrustedTarget = false;
    this.filter.reset();
    this.targetPlaybackRate = currentPlaybackRate;
    this.lastWallTime = undefined;
  }

  notifySeek(): void {
    if (!this.enabled) return;
    this.filter.reset();
    this.recoveryState = ControllerState.SeekRecovery;
    this.currentState = ControllerState.SeekRecovery;
  }

  notifyVideoChanged(): void {
    if (!this.enabled) return;
    this.filter.reset();
    this.recoveryState = ControllerState.VideoChanged;
    this.currentState = ControllerState.VideoChanged;
  }

  tick(input: ControllerTickInput): ControllerOutput {
    validateTickInput(input);

    if (!this.enabled) {
      return this.output(
        input.currentPlaybackRate,
        undefined,
        undefined,
        false,
      );
    }

    const elapsedWallSeconds =
      this.lastWallTime === undefined
        ? 0
        : Math.max(0, input.wallTime - this.lastWallTime);
    this.lastWallTime = input.wallTime;

    if (input.paused) {
      if (this.currentState !== ControllerState.Paused) {
        this.stateBeforePause = this.currentState;
      }
      this.currentState = ControllerState.Paused;
      return this.output(
        input.currentPlaybackRate,
        this.filter.value(),
        undefined,
        false,
      );
    }

    if (this.currentState === ControllerState.Paused) {
      this.currentState = this.recoveryState ?? this.stateBeforePause;
    }

    const gateResult = this.gate.evaluate(input.measurement);
    let rejectionReason: MeasurementRejectionReason | undefined;

    if (gateResult.accepted) {
      const filteredArticulationRate = this.filter.update(
        gateResult.measurement.articulationRate,
      );
      const candidateTarget = clamp(
        this.config.targetSyllablesPerSecond / filteredArticulationRate,
        this.config.minimumPlaybackRate,
        this.config.maximumPlaybackRate,
      );

      if (
        !this.hasTrustedTarget ||
        outsideRelativeDeadband(
          candidateTarget,
          this.targetPlaybackRate,
          this.config.relativeDeadband,
        )
      ) {
        this.targetPlaybackRate = candidateTarget;
      }

      this.hasTrustedTarget = true;
      this.recoveryState = undefined;
      this.currentState = ControllerState.Tracking;
    } else {
      rejectionReason = gateResult.reason;
      if (this.recoveryState !== undefined) {
        this.currentState = this.recoveryState;
      } else if (!this.hasTrustedTarget) {
        this.currentState = ControllerState.WarmingUp;
      } else {
        this.currentState = ControllerState.HoldingLowConfidence;
      }
    }

    if (!this.hasTrustedTarget) {
      return this.output(
        input.currentPlaybackRate,
        this.filter.value(),
        rejectionReason,
        false,
      );
    }

    const commandedPlaybackRate = limitPlaybackRate(
      input.currentPlaybackRate,
      this.targetPlaybackRate,
      elapsedWallSeconds,
      {
        maximumAccelerationPerWallSecond:
          this.config.maximumAccelerationPerWallSecond,
        maximumDecelerationPerWallSecond:
          this.config.maximumDecelerationPerWallSecond,
      },
    );

    return this.output(
      commandedPlaybackRate,
      this.filter.value(),
      rejectionReason,
      Math.abs(commandedPlaybackRate - input.currentPlaybackRate) > 1e-9,
    );
  }

  state(): ControllerState {
    return this.currentState;
  }

  targetRate(): number {
    return this.targetPlaybackRate;
  }

  private output(
    commandedPlaybackRate: number,
    filteredArticulationRate: number | undefined,
    rejectionReason: MeasurementRejectionReason | undefined,
    shouldApplyPlaybackRate: boolean,
  ): ControllerOutput {
    return {
      state: this.currentState,
      commandedPlaybackRate,
      targetPlaybackRate: this.targetPlaybackRate,
      filteredArticulationRate,
      rejectionReason,
      shouldApplyPlaybackRate,
    };
  }
}

function outsideRelativeDeadband(
  candidate: number,
  currentTarget: number,
  deadband: number,
): boolean {
  return Math.abs(Math.log(candidate / currentTarget)) > Math.log(1 + deadband);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function validateTickInput(input: ControllerTickInput): void {
  if (!Number.isFinite(input.wallTime) || input.wallTime < 0) {
    throw new RangeError("wallTime must be finite and non-negative");
  }
  if (!Number.isFinite(input.currentPlaybackRate) || input.currentPlaybackRate <= 0) {
    throw new RangeError("currentPlaybackRate must be finite and positive");
  }
}
