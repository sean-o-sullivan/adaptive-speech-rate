import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ArticulationEstimator } from "../../src/estimation/articulation-estimator.js";

describe("ArticulationEstimator", () => {
  it("divides syllables by active speech rather than elapsed window time", () => {
    const estimator = new ArticulationEstimator();
    estimator.addSpeechInterval({
      mediaTimeStart: 0,
      mediaTimeEnd: 2,
      confidence: 1,
    });
    for (const mediaTime of [0.25, 0.75, 1.25, 1.75]) {
      estimator.addSyllable({ mediaTime, confidence: 1 });
    }

    const measurement = estimator.measure(4, 4);

    assertClose(measurement?.activeSpeechDuration, 2);
    assertClose(measurement?.articulationRate, 2);
  });

  it("uses a source-media-time lookback window", () => {
    const estimator = new ArticulationEstimator();
    estimator.addSpeechInterval({
      mediaTimeStart: 0,
      mediaTimeEnd: 10,
      confidence: 1,
    });
    for (let mediaTime = 0.125; mediaTime < 10; mediaTime += 0.25) {
      estimator.addSyllable({ mediaTime, confidence: 1 });
    }

    const measurement = estimator.measure(10, 4);

    assertClose(measurement?.activeSpeechDuration, 4);
    assertClose(measurement?.articulationRate, 4, 0.1);
  });

  it("does not double-count overlapping speech intervals", () => {
    const estimator = new ArticulationEstimator();
    estimator.addSpeechInterval({
      mediaTimeStart: 0,
      mediaTimeEnd: 2,
      confidence: 0.8,
    });
    estimator.addSpeechInterval({
      mediaTimeStart: 1,
      mediaTimeEnd: 3,
      confidence: 1,
    });
    for (const mediaTime of [0.5, 1.5, 2.5]) {
      estimator.addSyllable({ mediaTime, confidence: 1 });
    }

    const measurement = estimator.measure(3, 3);

    assertClose(measurement?.activeSpeechDuration, 3);
    assertClose(measurement?.articulationRate, 1);
    assertClose(measurement?.confidence, 14 / 15);
  });

  it("clears stale evidence on reset", () => {
    const estimator = new ArticulationEstimator();
    estimator.addSpeechInterval({
      mediaTimeStart: 0,
      mediaTimeEnd: 1,
      confidence: 1,
    });
    estimator.addSyllable({ mediaTime: 0.5, confidence: 1 });

    estimator.reset();

    assert.equal(estimator.measure(1, 4), undefined);
  });
});

function assertClose(
  actual: number | undefined,
  expected: number,
  tolerance = 1e-9,
): void {
  assert.notEqual(actual, undefined);
  assert.ok(Math.abs((actual ?? 0) - expected) <= tolerance);
}
