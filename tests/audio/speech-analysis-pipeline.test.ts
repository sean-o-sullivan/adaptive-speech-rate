import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AudioAnalysisFrame } from "../../src/audio/audio-frame.js";
import { SpeechAnalysisPipeline } from "../../src/audio/speech-analysis-pipeline.js";

describe("SpeechAnalysisPipeline", () => {
  it("estimates a stable synthetic four-syllable-per-second envelope", () => {
    const result = runSpeechEnvelope(1);

    assert.equal(result.accepted, true);
    assert.ok(result.syllablesDetected >= 20 && result.syllablesDetected <= 25);
    assert.ok((result.measurement?.articulationRate ?? 0) > 3);
    assert.ok((result.measurement?.articulationRate ?? Infinity) < 4.5);
  });

  it("is approximately invariant to playback-compressed frame arrival", () => {
    const atOne = runSpeechEnvelope(1).measurement?.articulationRate;
    const atThree = runSpeechEnvelope(3).measurement?.articulationRate;

    assert.notEqual(atOne, undefined);
    assert.notEqual(atThree, undefined);
    const relativeDifference = Math.abs((atOne ?? 0) - (atThree ?? 0)) / (atOne ?? 1);
    assert.ok(relativeDifference < 0.15);
  });

  it("stops accepting updates after speech evidence becomes stale", () => {
    const pipeline = new SpeechAnalysisPipeline();
    feedSpeech(pipeline, 0, 4, 0.01);
    feedSilence(pipeline, 4, 0.2, 0.01);
    const syllablesAfterRelease = pipeline.snapshot().syllablesDetected;
    feedSilence(pipeline, 4.2, 1.8, 0.01);
    const afterPause = pipeline.snapshot();

    assert.equal(afterPause.accepted, false);
    assert.equal(afterPause.rejectionReason, "stale");
    assert.equal(afterPause.syllablesDetected, syllablesAfterRelease);
  });

  it("clears all evidence on reset", () => {
    const pipeline = new SpeechAnalysisPipeline();
    feedSpeech(pipeline, 0, 2, 0.01);
    pipeline.reset();

    assert.equal(pipeline.snapshot().frames, 0);
    assert.equal(pipeline.snapshot().measurement, undefined);
    assert.equal(pipeline.snapshot().syllablesDetected, 0);
  });

  it("resets evidence when the source-time analysis window changes", () => {
    const pipeline = new SpeechAnalysisPipeline();
    feedSpeech(pipeline, 0, 4, 0.01);

    pipeline.setAnalysisWindowSeconds(2);

    assert.equal(pipeline.snapshot().frames, 0);
    assert.equal(pipeline.snapshot().measurement, undefined);
    feedSpeech(pipeline, 4, 3, 0.01);
    assert.ok(
      (pipeline.snapshot().measurement?.activeSpeechDuration ?? Infinity) <=
        2.01,
    );
  });
});

function runSpeechEnvelope(playbackRate: number) {
  const pipeline = new SpeechAnalysisPipeline();
  feedSpeech(pipeline, 0, 6, 0.01 * playbackRate);
  return pipeline.snapshot();
}

function feedSpeech(
  pipeline: SpeechAnalysisPipeline,
  start: number,
  duration: number,
  sourceStep: number,
): void {
  for (let mediaTime = start; mediaTime < start + duration; mediaTime += sourceStep) {
    const phase = ((mediaTime + 0.125) % 0.25) - 0.125;
    const pulse = Math.exp(-0.5 * (phase / 0.035) ** 2);
    const rms = 0.015 + 0.12 * pulse;
    pipeline.process(frame(mediaTime, sourceStep, rms));
  }
}

function feedSilence(
  pipeline: SpeechAnalysisPipeline,
  start: number,
  duration: number,
  sourceStep: number,
): void {
  for (let mediaTime = start; mediaTime < start + duration; mediaTime += sourceStep) {
    pipeline.process(frame(mediaTime, sourceStep, 0.00001));
  }
}

function frame(
  mediaTimeStart: number,
  duration: number,
  rms: number,
): AudioAnalysisFrame {
  return {
    mediaTimeStart,
    mediaTimeEnd: mediaTimeStart + duration,
    sourceDurationSeconds: duration,
    rms,
    peak: rms * 1.5,
    zeroCrossingRate: 0.08,
  };
}
