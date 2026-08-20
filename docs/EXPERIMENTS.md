# Experiments

Append results; do not rewrite failed observations into a clean narrative.

## 2026-08-20 — Milestone 0 specification lock

- Scope: translate controlling brief into interfaces, timing domains, state transitions, and conservative defaults.
- Observed: source-media and wall-time responsibilities can be separated without browser dependencies.
- Decision: build the deterministic estimator/controller before browser capture.
- Unknown: which direct audio-capture route Dia exposes reliably on YouTube.
- Next discriminator: simulation must demonstrate stable constant/step response, silence hold, dropout hold, false-burst rejection, and seek recovery.

## 2026-08-20 — Milestone 1 deterministic controller

- Material: synthetic source-media syllable events and speech intervals; 100 ms wall-time controller ticks.
- Scenarios: constant 3 and 7 syl/s speakers; 3→7 and 7→3 syl/s steps; five-second pause; five-second detector dropout; 60-candidate false burst; forward seek; different initial playback rates; three-hour alternating session.
- Observed: 28/28 unit and simulation tests pass.
- Observed: 3 syl/s converged to 2.67x; 7 syl/s converged near 1.14x.
- Observed: pause and dropout held the prior target; neither reached maximum speed.
- Observed: false burst crossed the plausible-rate gate and all commanded changes remained inside slew limits.
- Observed: seek reset left only fresh post-seek evidence and remained in recovery until confidence thresholds passed.
- Observed: the same synthetic 4 syl/s passage estimated approximately 4 syl/s from 1x and 3x starts.
- Observed: the three-hour alternating run remained finite and within configured bounds.
- Tooling regression: Vitest 4.1.11 triggered an npm 10 peer-tree failure before installation. Replaced it with Node's built-in test runner; fewer dependencies, same coverage.
- Decision: Milestone 1 exit condition met. Proceed to diagnostics-only YouTube lifecycle and capture spike; do not connect playback control yet.

## 2026-08-20 — Milestone 2 shell and direct-capture spike build

- Implemented: Manifest V3 YouTube-only content script; SPA/video-element lifecycle observer; pause, seek, rate, ad, URL, and element-change diagnostics; explicit user-gesture audio probe.
- Capture path: `HTMLMediaElement.captureStream()` into a local `AudioContext` analyser. No audio output connection, tab capture, background worker, cloud path, or playback-rate write.
- Safety decision: do not automatically reroute the YouTube media element through `createMediaElementSource()` before direct capture is proven to fail in Dia.
- Permissions: no privileged extension API permissions; host scope limited to `https://www.youtube.com/*`.
- Build: 13,137-byte JavaScript bundle plus source map and manifest; syntax check passed.
- Verification: TypeScript, 30 tests, manifest assertions, simulation suite, and production build pass.
- Blocked observation: no in-app or external browser was connected to this Codex session. Dia extension loading, non-zero RMS, audible routing, SPA navigation, and high-speed capture remain unobserved.
- Exit status: Milestone 2 implementation exists, but Milestone 2/3 reality-facing exit conditions are not yet met.

## 2026-08-20 — First Dia direct-capture observation

- Evidence source: tester-reported diagnostics overlay; not independently observed by the implementation model.
- Material: a public YouTube speech video (URL omitted), playing at 1.00x around source media time 57.33 s.
- Reported: video found; playing; no seek or ad; one video element detected.
- Reported: audio status `running`; `AudioContext` running; capture method `captureStream`; one captured audio track.
- Reported signal: RMS `0.09483`; peak RMS `0.19530`; speech probability `1.00`; no capture error.
- Supported conclusion: Dia exposes direct video-element capture for this case, and the extension received non-zero audio samples without tab-capture permissions.
- Still unknown: whether audible playback stayed normal and unduplicated; continuity across pause/resume, seek, SPA video change, ads, fullscreen, and 1.5x–4x playback.
- Decision: retain direct `captureStream()` architecture. Do not implement tab capture or connect adaptive control yet.
- Smallest next checkpoint: verify audible output plus signal continuity at 2x, 3x, and 4x; then seek and SPA-navigate while watching lifecycle/capture recovery.

## 2026-08-20 — Dia direct capture at 3x

- Evidence source: tester-reported diagnostics overlay and explicit audible assessment; not independently observed by the implementation model.
- Material: a second public YouTube video (URL omitted), playing at 3.00x around source media time 95.29 s.
- Reported: audio sounded perfect; no muting, duplication, or distortion reported.
- Reported: audio status and `AudioContext` running; capture method `captureStream`; one track; `Audio captured: yes`.
- Reported signal: RMS `0.45342`; peak RMS `0.48669`; speech probability `1.00`; no capture error.
- Supported conclusion: the preferred direct-capture path delivers strong non-zero samples at 3x without disturbing audible output, across two tested YouTube URLs.
- Evidence boundary: `Seeks: 0` and `Video changes: 1` do not demonstrate seek recovery or same-tab YouTube SPA navigation. Content type and source speech rate were not established, so this does not validate a speech detector.
- Decision: direct capture is the retained architecture; no fallback capture path is justified.
- Smallest next checkpoint: seek while capture runs, then navigate to another video in the same tab and restart capture. If both pass, begin diagnostics-only speech/syllable detection.

## 2026-08-20 — Capture and lifecycle spike exit

- Evidence source: tester report; not independently observed by the implementation model.
- Reported: seeking works; navigation to a new video works; restarting the direct probe works; audible output remains perfect.
- Supported conclusion: direct capture survived the required user interactions in Dia. No fallback capture architecture or additional capture permission is justified.
- Decision: Milestone 2/3 capture and lifecycle risk spike exits. Proceed to diagnostics-only detector work; adaptive playback remains disconnected until detector speed-invariance passes.
- Product requirement added during testing: a fast way to disable the extension for music listening.
- Implementation decision: one persisted master setting, exposed in the toolbar popup and as **Disable extension** in diagnostics. Off tears down audio capture, lifecycle polling, overlay, and future playback ownership.
- Smallest next checkpoint: reload the rebuilt extension and verify off removes the overlay/stops capture, then re-enable from the toolbar. Begin detector diagnostics afterward.

## 2026-08-20 — Diagnostics-only detector build

- Implemented: 256-sample `AudioWorklet` frames; 90 Hz–4.5 kHz first-order speech-band filtering; source-media timestamp reconstruction; adaptive energy floor; source-time speech hysteresis; source-time energy-peak syllable detector; articulation estimator and confidence gate.
- Safety boundary: detector output is diagnostic only. Source and built content scripts contain no `HTMLVideoElement.playbackRate` assignment.
- Synthetic verification: a four-syllable-per-second envelope is detected within the expected range; compressed frame arrival remains within 15% of the 1x estimate; silence expires evidence; reset clears all state.
- Full verification: TypeScript, production build, and 38/38 tests pass.
- Known limitation: the detector is energy/sonority based and has not been calibrated against real labelled speech. Music rejection is not a current goal because the master switch explicitly removes music sessions from scope.
- Unknown: real passage invariance at 1x, 2x, and 3x in Dia; cross-speaker count stability; suitable prominence and confidence thresholds.
- Decision: expose diagnostics for reality-facing measurement. Do not connect the controller.
- Smallest next checkpoint: reload the extension, verify the master off/on path, then record detector output over the identical spoken passage at 1x, 2x, and 3x.

## 2026-08-20 — Superseded master-switch interaction

- User correction: removing the overlay on disable forces an unwanted trip to the toolbar before resuming.
- Supersedes: the capture-exit entry's decision that off tears down the overlay.
- Revised decision: the page overlay is persistent. **Adaptive: ON/OFF** stops or resumes audio analysis and future playback control in place. Off resets evidence and grays the diagnostics while keeping the same button active. Toolbar control remains a mirror, not the primary route.
- Implementation: lifecycle observation and overlay rendering remain mounted while off; audio capture and detector state stop immediately. The setting still persists locally.
- Verification: TypeScript, 38/38 tests, production build, and built-bundle syntax checks pass. Automated DOM interaction is unavailable in the dependency-minimal harness; Dia reload remains the reality-facing check.
- Smallest next checkpoint: reload the extension; press **Adaptive: ON**, confirm it becomes **Adaptive: OFF**, capture stops, and the grayed overlay remains; press again and restart the probe.

## 2026-08-20 — Persistent overlay and first live detector output

- Evidence source: tester-reported overlays and explicit statement that the revised interaction works; not independently observed by the implementation model.
- UI result: persistent grayed-off overlay and same-button resume accepted. Music bypass requirement is met.
- Material: a public YouTube speech video (URL omitted), 1.00x playback.
- Sample at source time 20.03 s: speech probability `0.68`; 76 total nuclei; source articulation `4.66 syl/s`; 15.8 weighted syllables over 3.39 active source seconds; confidence `0.88`; gate accepted.
- Sample at source time 49.26 s: speech probability `1.00`; 183 total nuclei; source articulation `5.75 syl/s`; 21.2 weighted syllables over 3.70 active source seconds; confidence `0.95`; gate accepted.
- Supported conclusion: real Dia audio reaches the complete worklet/detector/estimator path and produces finite, accepted source-articulation measurements at 1x.
- Evidence boundary: samples cover different passages. Their `4.66` versus `5.75 syl/s` difference may reflect real speaker variation, detector variation, or both; it cannot establish accuracy or speed invariance.
- Diagnostic oddity: `Video changes` was 26 in both samples. No continuing churn occurred across the 29-second interval, but the earlier count's cause is unknown.
- Decision: master-switch UI exits. Detector remains diagnostic-only.
- Smallest next checkpoint: measure the identical spoken passage at 1x, 2x, and 3x after each reset; compare accepted source-articulation estimates.

## 2026-08-20 — Detector speed-invariance exit

- Evidence source: tester-reported diagnostics overlays; not independently observed by the implementation model.
- Material: an identical passage around source time 23–26 s in a public YouTube speech video (URL omitted).
- Reported at 1x: `6.85 syl/s`, 24.7 weighted syllables over 3.61 active source seconds, confidence `0.95`, accepted.
- Reported at 2x: `6.35 syl/s`, 22.9 weighted syllables over 3.60 active source seconds, confidence `0.95`, accepted.
- Reported at 3x: `7.24 syl/s`, 26.7 weighted syllables over 3.68 active source seconds, confidence `0.95`, accepted.
- Observed calculation: mean `6.81 syl/s`; maximum-minus-minimum spread `0.89 syl/s`, or `13.1%` of the mean.
- Supported conclusion: this passage passes the provisional ≤15% detector speed-invariance threshold. It does not establish linguistic accuracy or cross-speaker calibration.
- Decision: detector invariance gate exits. Connect the existing conservative controller for a bounded live test.

## 2026-08-20 — First closed-loop build

- Implemented: live detector measurements now feed the tested confidence gate, median/EMA filter, ratio controller, deadband, playback bounds, and asymmetric wall-time slew limiter.
- Overlay: persistent controls for target articulation, source-time analysis window, minimum speed, and maximum speed; live controller state, filtered rate, target speed, commanded speed, and delivered articulation.
- Safety behaviour: warm-up requires accepted evidence; pause/ad hold writes; seek resets evidence; SPA navigation/video replacement stops capture and control; manual YouTube speed selection disables adaptive mode while preserving the chosen speed; controller-authored rate events do not self-disable.
- Music switch: **Adaptive: ON/OFF** still stops capture/control and leaves the overlay visible and grayed; turning it back on starts capture within the same user gesture.
- Verification: TypeScript, 44/44 tests, production build, and built-bundle syntax checks pass.
- Evidence boundary: implementation and automated checks do not establish live Dia behaviour, audible smoothness, manual-override recognition, or controller stability on real speech.
- Smallest next checkpoint: reload `dist/`, run one speech video from 1x, and report warm-up/tracking state, filtered rate, target/actual speeds, and whether acceleration sounds smooth.

## 2026-08-20 — First live closed-loop result and UI reduction

- Evidence source: tester report after starting adaptive mode and increasing the target enough to make the response obvious; not independently observed by the implementation model.
- Reported result: “IT WORKS.” The controller produced an audible playback-rate change from live detector output in Dia.
- Evidence boundary: no stable overlay snapshot or quantitative slew trace was captured. This establishes end-to-end operation, not tuning quality, long-session stability, or cross-video robustness.
- Product correction: the full always-visible diagnostics panel was too obtrusive, and settings were difficult to discover within it.
- Revised UI: a compact persistent page pill shows the speed/state, **Start**, and **ON/OFF**. Clicking its readout expands the full diagnostics panel. Target, window, and playback bounds move to the extension popup.
- Identity: a deterministic speedometer mark is supplied at 16, 32, 48, and 128 px for the extension toolbar; the 32 px mark temporarily replaces YouTube's tab favicon while adaptive mode is enabled and is removed when off.
- Icon correction: the initial Quick Look rasterization flattened the SVG's transparent canvas to white, producing a visible square in Dia and the YouTube tab. Final PNGs chroma-remove that canvas; packaged corner alpha is `0–1/255` and center alpha is `244–255/255` across required sizes.
- Verification: TypeScript, 44/44 tests, manifest assertions, production build, built JavaScript syntax, and generated icon dimensions pass. Dia UI verification remains required after extension and tab reload.
