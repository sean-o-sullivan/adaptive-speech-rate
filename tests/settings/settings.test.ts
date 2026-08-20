import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  controllerConfigFromSettings,
  DEFAULT_SETTINGS,
  normalizeSettings,
} from "../../src/settings/settings.js";

describe("settings", () => {
  it("defaults enabled for existing capture-spike installs", () => {
    assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
    assert.equal(DEFAULT_SETTINGS.enabled, true);
  });

  it("preserves an explicit disabled state", () => {
    assert.deepEqual(normalizeSettings({ enabled: false }), {
      ...DEFAULT_SETTINGS,
      enabled: false,
    });
  });

  it("rejects non-boolean stored values", () => {
    assert.deepEqual(normalizeSettings({ enabled: "false" }), DEFAULT_SETTINGS);
  });

  it("accepts valid controller settings", () => {
    assert.deepEqual(
      normalizeSettings({
        enabled: true,
        targetSyllablesPerSecond: 9.5,
        analysisWindowSeconds: 6,
        minimumPlaybackRate: 0.75,
        maximumPlaybackRate: 3.5,
      }),
      {
        enabled: true,
        targetSyllablesPerSecond: 9.5,
        analysisWindowSeconds: 6,
        minimumPlaybackRate: 0.75,
        maximumPlaybackRate: 3.5,
      },
    );
  });

  it("falls back safely for invalid or crossed bounds", () => {
    assert.deepEqual(
      normalizeSettings({
        targetSyllablesPerSecond: Infinity,
        analysisWindowSeconds: 0,
        minimumPlaybackRate: 3,
        maximumPlaybackRate: 1,
      }),
      DEFAULT_SETTINGS,
    );
  });

  it("maps user controls without changing fixed safety dynamics", () => {
    const config = controllerConfigFromSettings({
      enabled: true,
      targetSyllablesPerSecond: 9,
      analysisWindowSeconds: 6,
      minimumPlaybackRate: 0.75,
      maximumPlaybackRate: 3.5,
    });

    assert.equal(config.targetSyllablesPerSecond, 9);
    assert.equal(config.analysisWindowSeconds, 6);
    assert.equal(config.minimumPlaybackRate, 0.75);
    assert.equal(config.maximumPlaybackRate, 3.5);
    assert.equal(config.relativeDeadband, 0.05);
    assert.equal(config.maximumAccelerationPerWallSecond, 0.25);
    assert.equal(config.maximumDecelerationPerWallSecond, 0.4);
  });
});
