import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { limitPlaybackRate } from "../../src/control/rate-limiter.js";

const limit = {
  maximumAccelerationPerWallSecond: 0.25,
  maximumDecelerationPerWallSecond: 0.4,
};

describe("limitPlaybackRate", () => {
  it("limits acceleration in wall time", () => {
    assert.equal(limitPlaybackRate(1, 3, 2, limit), 1.5);
  });

  it("allows faster deceleration in wall time", () => {
    assert.ok(Math.abs(limitPlaybackRate(3, 1, 2, limit) - 2.2) < 1e-9);
  });

  it("does not overshoot the target", () => {
    assert.equal(limitPlaybackRate(1.9, 2, 1, limit), 2);
    assert.equal(limitPlaybackRate(2.1, 2, 1, limit), 2);
  });
});
