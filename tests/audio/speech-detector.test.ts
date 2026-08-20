import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AudioAnalysisFrame } from "../../src/audio/audio-frame.js";
import { SpeechDetector } from "../../src/audio/speech-detector.js";

describe("SpeechDetector", () => {
  it("uses attack and release hysteresis", () => {
    const detector = new SpeechDetector();
    let mediaTime = 0;

    for (let index = 0; index < 10; index += 1) {
      const detection = detector.process(frame(mediaTime, 0.02, 0.00001));
      assert.equal(detection.active, false);
      mediaTime += 0.02;
    }

    let becameActive = false;
    for (let index = 0; index < 5; index += 1) {
      const detection = detector.process(frame(mediaTime, 0.02, 0.1));
      becameActive ||= detection.active;
      mediaTime += 0.02;
    }
    assert.equal(becameActive, true);

    let finalActive = true;
    for (let index = 0; index < 10; index += 1) {
      finalActive = detector.process(frame(mediaTime, 0.02, 0.00001)).active;
      mediaTime += 0.02;
    }
    assert.equal(finalActive, false);
  });
});

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
