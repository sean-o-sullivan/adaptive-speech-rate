import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_CONTROLLER_CONFIG } from "../../src/config.js";
import { ControllerState } from "../../src/control/controller-state.js";
import {
  simulateScenario,
  type SimulationScenario,
} from "../../src/simulation/controller-simulator.js";
import { DEFAULT_SCENARIOS } from "../../src/simulation/scenarios.js";

function namedScenario(name: string): SimulationScenario {
  const scenario = DEFAULT_SCENARIOS.find((candidate) => candidate.name === name);
  if (scenario === undefined) throw new Error(`missing scenario: ${name}`);
  return scenario;
}

describe("controller simulation", () => {
  it("converges for constant slow and fast speakers", () => {
    const slow = simulateScenario(namedScenario("constant slow speaker"));
    const fast = simulateScenario(namedScenario("constant fast speaker"));

    assertClose(slow.trace.at(-1)?.controller.commandedPlaybackRate, 8 / 3, 0.1);
    assertClose(fast.trace.at(-1)?.controller.commandedPlaybackRate, 8 / 7, 0.1);
  });

  it("respects asymmetric slew limits across source-rate steps", () => {
    const increasing = simulateScenario(namedScenario("sudden increase"));
    const decreasing = simulateScenario(namedScenario("sudden decrease"));

    assertPerStepLimits(increasing);
    assertPerStepLimits(decreasing);

    assertClose(
      increasing.trace.at(-1)?.controller.commandedPlaybackRate,
      8 / 7,
      0.1,
    );
    assertClose(
      decreasing.trace.at(-1)?.controller.commandedPlaybackRate,
      8 / 3,
      0.15,
    );
  });

  it("holds through pauses instead of accelerating", () => {
    const result = simulateScenario(namedScenario("pause"));
    const pausePoints = result.trace.filter(
      (point) => point.sourceSegment === "pause",
    );
    const pauseRates = pausePoints.map(
      (point) => point.controller.targetPlaybackRate,
    );

    assert.ok(pausePoints.length > 0);
    assert.ok(Math.max(...pauseRates) - Math.min(...pauseRates) < 0.15);
    assert.ok(
      Math.max(...pauseRates) < DEFAULT_CONTROLLER_CONFIG.maximumPlaybackRate,
    );
    assert.equal(
      pausePoints.some(
        (point) =>
          point.controller.state === ControllerState.HoldingLowConfidence,
      ),
      true,
    );
  });

  it("holds during detector dropout", () => {
    const result = simulateScenario(namedScenario("detector dropout"));
    const dropoutPoints = result.trace.filter(
      (point) => point.sourceSegment === "detector dropout",
    );
    const targets = dropoutPoints.map(
      (point) => point.controller.targetPlaybackRate,
    );

    assert.ok(Math.max(...targets) - Math.min(...targets) < 0.15);
    assert.ok(
      Math.max(...targets) < DEFAULT_CONTROLLER_CONFIG.maximumPlaybackRate,
    );
  });

  it("contains a false detection burst", () => {
    const result = simulateScenario(namedScenario("false detection burst"));

    assertPerStepLimits(result);
    assert.equal(
      result.trace.some(
        (point) => point.controller.rejectionReason === "implausibly_fast",
      ),
      true,
    );
    assertClose(result.trace.at(-1)?.controller.targetPlaybackRate, 2, 0.1);
  });

  it("clears evidence and warms up after seeking", () => {
    const result = simulateScenario(namedScenario("seek"));
    const afterSeek = result.trace.find(
      (point) =>
        point.wallTime >= 5 &&
        point.controller.state === ControllerState.SeekRecovery,
    );

    assert.notEqual(afterSeek, undefined);
    assert.equal(afterSeek?.controller.rejectionReason, "too_few_candidates");
    assert.ok((afterSeek?.measurement?.activeSpeechDuration ?? Infinity) < 0.5);
    assert.ok((afterSeek?.measurement?.mediaTime ?? 0) >= 120);
  });

  it("remains finite and bounded over a multi-hour synthetic session", () => {
    const result = simulateScenario({
      name: "three-hour alternating session",
      segments: Array.from({ length: 36 }, (_, index) => ({
        label: `segment ${index}`,
        durationSeconds: 300,
        articulationRate: index % 2 === 0 ? 3 : 7,
      })),
    });

    for (const point of result.trace) {
      const rate = point.controller.commandedPlaybackRate;
      assert.equal(Number.isFinite(rate), true);
      assert.ok(rate >= DEFAULT_CONTROLLER_CONFIG.minimumPlaybackRate);
      assert.ok(rate <= DEFAULT_CONTROLLER_CONFIG.maximumPlaybackRate);
    }
  });

  it("estimates the same source passage from different starting speeds", () => {
    const scenario: SimulationScenario = {
      name: "speed invariance",
      segments: [
        { label: "speech", durationSeconds: 20, articulationRate: 4 },
      ],
    };
    const fromOne = simulateScenario(scenario, { initialPlaybackRate: 1 });
    const fromThree = simulateScenario(scenario, { initialPlaybackRate: 3 });

    assertClose(lastMeasuredRate(fromOne), 4, 0.1);
    assertClose(lastMeasuredRate(fromThree), 4, 0.1);
  });
});

function assertPerStepLimits(result: ReturnType<typeof simulateScenario>): void {
  for (let index = 1; index < result.trace.length; index += 1) {
    const previous = result.trace[index - 1];
    const current = result.trace[index];
    if (previous === undefined || current === undefined) continue;
    const elapsed = current.wallTime - previous.wallTime;
    const difference =
      current.controller.commandedPlaybackRate -
      previous.controller.commandedPlaybackRate;

    assert.ok(
      difference <=
      DEFAULT_CONTROLLER_CONFIG.maximumAccelerationPerWallSecond * elapsed +
        1e-9,
    );
    assert.ok(
      difference >=
      -DEFAULT_CONTROLLER_CONFIG.maximumDecelerationPerWallSecond * elapsed -
        1e-9,
    );
  }
}

function assertClose(
  actual: number | undefined,
  expected: number,
  tolerance: number,
): void {
  assert.notEqual(actual, undefined);
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance);
}

function lastMeasuredRate(
  result: ReturnType<typeof simulateScenario>,
): number {
  const rate = [...result.trace]
    .reverse()
    .find((point) => point.measurement !== undefined)?.measurement
    ?.articulationRate;
  if (rate === undefined) throw new Error("simulation produced no measurement");
  return rate;
}
