import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_CONTROLLER_CONFIG } from "../../src/config.js";
import { ConfidenceGate } from "../../src/estimation/confidence-gate.js";
import type { ArticulationMeasurement } from "../../src/types/measurements.js";

const validMeasurement: ArticulationMeasurement = {
  mediaTime: 4,
  articulationRate: 4,
  confidence: 0.9,
  activeSpeechDuration: 2,
  syllableCount: 8,
  candidateCount: 8,
  ageSeconds: 0,
};

describe("ConfidenceGate", () => {
  const gate = new ConfidenceGate(DEFAULT_CONTROLLER_CONFIG.gate);

  it("accepts sufficient fresh evidence", () => {
    assert.equal(gate.evaluate(validMeasurement).accepted, true);
  });

  const rejected = [
    [{ ...validMeasurement, candidateCount: 2 }, "too_few_candidates"],
    [{ ...validMeasurement, activeSpeechDuration: 0.5 }, "too_little_speech"],
    [{ ...validMeasurement, confidence: 0.3 }, "low_confidence"],
    [{ ...validMeasurement, ageSeconds: 2 }, "stale"],
    [{ ...validMeasurement, articulationRate: 0.5 }, "implausibly_slow"],
    [{ ...validMeasurement, articulationRate: 20 }, "implausibly_fast"],
  ] as const;

  for (const [measurement, reason] of rejected) {
    it(`rejects ${reason}`, () => {
      assert.deepEqual(gate.evaluate(measurement), {
        accepted: false,
        reason,
        measurement,
      });
    });
  }
});
