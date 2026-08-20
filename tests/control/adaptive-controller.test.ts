import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_CONTROLLER_CONFIG } from "../../src/config.js";
import { AdaptiveController } from "../../src/control/adaptive-controller.js";
import { ControllerState } from "../../src/control/controller-state.js";
import type { ArticulationMeasurement } from "../../src/types/measurements.js";

function measurement(articulationRate: number): ArticulationMeasurement {
  return {
    mediaTime: 4,
    articulationRate,
    confidence: 1,
    activeSpeechDuration: 4,
    syllableCount: articulationRate * 4,
    candidateCount: Math.round(articulationRate * 4),
    ageSeconds: 0,
  };
}

describe("AdaptiveController", () => {
  it("calculates target/estimated rate and glides toward it", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG);
    controller.enable(1, 0);

    const output = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 1,
      paused: false,
      measurement: measurement(4),
    });

    assert.equal(output.state, ControllerState.Tracking);
    assertClose(output.targetPlaybackRate, 2);
    assertClose(output.commandedPlaybackRate, 1.25);
  });

  it("holds its trustworthy target when evidence disappears", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG);
    controller.enable(1, 0);
    const tracking = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 1,
      paused: false,
      measurement: measurement(4),
    });

    const holding = controller.tick({
      wallTime: 2,
      currentPlaybackRate: tracking.commandedPlaybackRate,
      paused: false,
    });

    assert.equal(holding.state, ControllerState.HoldingLowConfidence);
    assert.equal(holding.rejectionReason, "missing");
    assert.equal(holding.targetPlaybackRate, tracking.targetPlaybackRate);
  });

  it("ignores target movement inside the multiplicative deadband", () => {
    const controller = new AdaptiveController({
      ...DEFAULT_CONTROLLER_CONFIG,
      filter: { medianHistoryLength: 1, emaAlpha: 1 },
    });
    controller.enable(1, 0);
    const initial = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 1,
      paused: false,
      measurement: measurement(4),
    });
    const withinBand = controller.tick({
      wallTime: 2,
      currentPlaybackRate: initial.commandedPlaybackRate,
      paused: false,
      measurement: measurement(3.9),
    });

    assert.equal(withinBand.targetPlaybackRate, initial.targetPlaybackRate);
  });

  it("preserves state while paused", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG);
    controller.enable(1, 0);
    const tracking = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 1,
      paused: false,
      measurement: measurement(4),
    });
    const paused = controller.tick({
      wallTime: 2,
      currentPlaybackRate: tracking.commandedPlaybackRate,
      paused: true,
    });

    assert.equal(paused.state, ControllerState.Paused);
    assert.equal(paused.shouldApplyPlaybackRate, false);

    const resumed = controller.tick({
      wallTime: 3,
      currentPlaybackRate: tracking.commandedPlaybackRate,
      paused: false,
      measurement: measurement(4),
    });
    assert.equal(resumed.state, ControllerState.Tracking);
  });

  it("requires fresh evidence after a seek", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG);
    controller.enable(1, 0);
    const tracking = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 1,
      paused: false,
      measurement: measurement(4),
    });

    controller.notifySeek();
    const recovery = controller.tick({
      wallTime: 2,
      currentPlaybackRate: tracking.commandedPlaybackRate,
      paused: false,
    });

    assert.equal(recovery.state, ControllerState.SeekRecovery);
    assert.equal(recovery.targetPlaybackRate, tracking.targetPlaybackRate);
  });

  it("releases playback ownership when disabled", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG);
    controller.enable(1, 0);
    controller.disable(1.75);

    const output = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 1.75,
      paused: false,
    });

    assert.equal(output.state, ControllerState.Disabled);
    assert.equal(output.commandedPlaybackRate, 1.75);
    assert.equal(output.shouldApplyPlaybackRate, false);
  });

  it("does not enforce bounds before the first trustworthy measurement", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG, 4);
    controller.enable(4, 0);

    const output = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 4,
      paused: false,
    });

    assert.equal(output.state, ControllerState.WarmingUp);
    assert.equal(output.commandedPlaybackRate, 4);
    assert.equal(output.shouldApplyPlaybackRate, false);
  });

  it("returns an out-of-bound starting rate through the slew limiter", () => {
    const controller = new AdaptiveController(DEFAULT_CONTROLLER_CONFIG, 4);
    controller.enable(4, 0);

    const output = controller.tick({
      wallTime: 1,
      currentPlaybackRate: 4,
      paused: false,
      measurement: measurement(4),
    });

    assert.equal(output.state, ControllerState.Tracking);
    assertClose(output.targetPlaybackRate, 2);
    assertClose(output.commandedPlaybackRate, 3.6);
  });
});

function assertClose(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 1e-9);
}
