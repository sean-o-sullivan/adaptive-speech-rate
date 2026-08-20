# Architecture

## Product boundary

The system estimates source articulation rate during active speech, then controls the whole video's playback multiplier so articulated speech approaches the listener's selected delivery rate.

It does not skip silence, remove dead air, transcribe, infer semantic difficulty, or optimize video duration. Silence is excluded from the estimator denominator but remains in playback.

## Timing domains

Two clocks are intentionally separate:

- Source media time: syllable events, speech intervals, lookback windows, detector refractory periods, seek discontinuities.
- Wall time: acceleration and deceleration limits perceived by the listener.

Current `playbackRate` is an output of the controller. It is never used to retrospectively repair a wall-time articulation estimate.

## Components

```text
page/video audio
  -> capture adapter
  -> speech detector
  -> syllable detector
  -> ArticulationEstimator (source-media-time event buffer)
  -> ConfidenceGate
  -> RobustRateFilter (median, then EMA)
  -> AdaptiveController (ratio, clamp, deadband)
  -> RateLimiter (wall time)
  -> HTMLVideoElement.playbackRate
```

Detector and controller are separated by `ArticulationMeasurement`. A detector replacement must not alter control logic.

## Core interfaces

```ts
interface SyllableEvent {
  mediaTime: number;
  confidence: number;
}

interface SpeechInterval {
  mediaTimeStart: number;
  mediaTimeEnd: number;
  confidence: number;
}

interface ArticulationMeasurement {
  mediaTime: number;
  articulationRate: number;
  confidence: number;
  activeSpeechDuration: number;
  syllableCount: number;
  candidateCount: number;
  ageSeconds: number;
}
```

## Lifecycle boundary

The YouTube adapter owns video discovery, SPA navigation, element replacement, pause/resume, seek detection, ads, and manual playback overrides. Seek and ad boundaries clear detector evidence and put the controller into recovery. Navigation or video replacement stops capture and playback ownership until the user starts adaptive mode on the new video. A manual YouTube speed change disables adaptive mode and preserves the user's selected speed. Controller-authored `ratechange` events are distinguished from manual changes.

## Audio-capture experiment

Test in Dia, in order:

1. `HTMLMediaElement.captureStream()` where exposed.
2. Page-world `AudioContext.createMediaElementSource()` with an `AudioWorklet`, explicitly verifying audible routing and cross-origin behaviour, only if direct capture fails.
3. `chrome.tabCapture` plus offscreen document only if direct element capture is unreliable.

The spike ends with a diagnostics overlay showing capture status, RMS, speech probability, media time, and playback rate. User-run Dia checks reported normal audio, non-zero signal at 1x and 3x, working seeks and same-tab navigation, and successful probe restart. The direct-capture exit condition is met.

The current diagnostics build implements only step 1. It will not reroute the media element through Web Audio until Dia establishes that direct capture is unusable; closing such a fallback graph can otherwise leave the element silent.

## Current detector spike

The capture stream feeds an `AudioWorklet` that:

- mixes channels to mono;
- applies first-order 90 Hz high-pass and 4.5 kHz low-pass filters;
- aggregates 256-sample frames;
- emits RMS, peak, and zero-crossing measurements.

The content runtime maps worklet context timestamps onto current source media time, including playback rate. Local DSP then applies an adaptive energy floor, source-time attack/release hysteresis, smoothed energy-peak detection, source-time syllable refractory period, articulation estimation, and confidence gating.

This is an intentionally replaceable first detector. Synthetic envelope tests establish timing and state behaviour, not linguistic accuracy. A user-run identical-passage check on 2026-08-20 reported accepted estimates of `6.85`, `6.35`, and `7.24 syl/s` at 1x, 2x, and 3x. The 0.89 syl/s full range is 13.1% of the 6.81 mean, inside the provisional 15% threshold. That evidence authorized the first closed-loop build; live controller behaviour remains unverified.

## Master switch

The persisted local `enabled` setting gates audio analysis and controller writes, not page-control existence. Off stops capture, resets detector/controller evidence, leaves the current playback rate unchanged, and retains a grayed compact pill with the same **OFF** button available for immediate resume. The pill shows current speed/state and expands diagnostics on demand. Target articulation, source-time window, and playback bounds are edited in the toolbar popup and persisted locally. A speedometer icon identifies the extension in the toolbar and replaces YouTube's favicon while enabled. The in-page switch was verified in Dia on 2026-08-20.

## Current assumptions and evidence

- Project root is this `speed` directory.
- The first runtime target is Chromium Manifest V3 in Dia on macOS.
- User-reported Dia tests on 2026-08-20: `captureStream()` exposed one audio track, clean audible output, and non-zero RMS at 1x and 3x; seeks, same-tab navigation, and probe restart worked.
- Synthetic controller work can proceed independently of browser capture.
