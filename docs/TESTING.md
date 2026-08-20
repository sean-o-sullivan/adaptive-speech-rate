# Manual Testing

## Build and load

```sh
npm install
npm run check
```

Load the generated `dist/` directory through Dia's unpacked-extension developer workflow. Exact Dia UI path remains unverified.

After rebuilding, reload the unpacked extension in Dia. Use **ON/OFF** in the compact page pill for music: off must stop capture, reset detector output, retain the grayed pill, and allow one-click resume. Use the speedometer toolbar icon to edit controller settings.

## Direct-capture proof

1. Open a normal YouTube speech video and start playback.
2. Confirm the diagnostics overlay finds the active video and reports changing media time.
3. Select **Start** in the compact pill.
4. Require all of:
   - Audio status: `running`.
   - Capture method: `captureStream`.
   - Captured tracks: at least `1`.
   - Audio captured: `yes` during audible speech.
   - RMS and peak RMS become non-zero.
   - Original audio remains audible, single, and undistorted.
5. Pause/resume and seek. Confirm lifecycle events and media time remain correct.
6. Navigate to another YouTube video without reloading the tab. Confirm video-change count increments, old capture stops, and the new video is found.
7. Restart the probe on the new video.
8. Manually test 1x, 1.5x, 2x, 2.5x, 3x, 3.5x, and 4x. Confirm RMS remains live and audio remains normal.
9. Check fullscreen and an ad transition if encountered.

## Failure recording

Record exact Dia version, URL, capture status, track count, RMS/peak RMS, audible behaviour, playback rate, navigation/seek behaviour, and console error.

If `captureStream` is absent, returns no audio track, or stays at zero RMS during audible speech, do not connect the controller. Record the failure first; then implement the least intrusive fallback experiment.

## Detector speed-invariance test

1. Choose a continuous spoken passage at least 20 seconds long.
2. At 1x, seek to its start, start the probe, and allow at least eight source seconds of speech. Record source articulation, syllables in window, active speech time, detector confidence, and gate state.
3. Repeat the identical passage at 2x and 3x. Seeking and rate changes intentionally reset detector history.
4. Require the gate to accept after warm-up and the source-articulation estimate to remain reasonably similar across speeds. A progressive drop such as `4.2 → 3.0 → 1.8 syl/s` is a failure.
5. Confirm music/non-speech use can be disabled and re-enabled from the persistent overlay.

## First closed-loop test

1. Reload the rebuilt unpacked extension. Open a speech video at 1x and press **Start** in the compact pill.
2. Require `WARMING_UP` before accepted evidence, then `TRACKING`.
3. Confirm target speed approximates `target articulation / filtered source rate` within the configured bounds.
4. Confirm playback glides rather than jumps. Default limits are +0.25x/s and -0.40x/s in wall time.
5. Pause and resume. Speed must hold while paused.
6. Seek. Require `SEEK_RECOVERY`, then fresh accepted evidence before tracking resumes.
7. Press **ON**. Capture and control must stop immediately; current playback speed must remain unchanged; the grayed pill must remain.
8. Press **OFF**. Capture and warm-up should resume from the pill without visiting the toolbar.
9. Change speed through YouTube's native control. Adaptive mode must switch off and preserve the manually selected speed.
10. Navigate to a new video in the same tab. Capture/control must stop until **Start** is pressed for the new video.

11. Open the extension's speedometer toolbar icon. Change the target and confirm the page controller resets to warm-up with the persisted value.
12. Confirm the speedometer replaces YouTube's tab favicon while enabled and the YouTube favicon returns while off.

Record controller state, filtered source rate, target speed, actual speed, delivered articulation, and whether motion sounds smooth. This is the first live-controller test; a passing build is not yet established.
