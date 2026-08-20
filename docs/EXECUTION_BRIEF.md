# Execution Brief: Adaptive Speech-Rate Controller for Learning Videos

## Controlling Assignment

Design and build a lightweight Chromium browser extension for YouTube that continuously changes playback speed to maintain a user-selected **delivered speech rate**, measured approximately in syllables per second.

This will be used primarily in **Dia on macOS** for lectures, technical explanations, interviews, podcasts, tutorials, and other learning material.

Start from a clean repository. Do not assume that the existing Speech Speed or Fwdly codebases must be reused. Existing projects may be inspected for ideas, but the architecture should be designed from first principles around the requirements below.

The resulting project may eventually be published as a public open-source GitHub repository. Keep the implementation clean, understandable, local-first, and suitable for public inspection.

---

# 1. Why This Exists

I use videos and spoken audio to learn constantly.

Fixed playback speed is inadequate because speakers change pace both between videos and within the same video:

- A slow speaker may be comfortable at 2.5× or 3×.
- Normal exposition may be comfortable around 1.6–2×.
- A rapid technical explanation may need to fall toward 1–1.4×.
- The useful speed can change from one sentence to the next.

I do not want to manage this manually.

The desired experience is:

> Choose how quickly I want spoken information delivered, and let the extension continuously adapt the video speed to the speaker.

The system should disappear into the background. I should eventually stop noticing playback speed changes.

---

# 2. The Core Product Definition

The user chooses:

1. A **target delivered articulation rate**, approximately in syllables per second.
2. An **analysis window**, expressed in seconds.
3. Minimum and maximum allowed playback speeds.

The extension estimates the speaker’s current natural articulation rate and calculates:

```text
desired playback speed
=
target delivered articulation rate
/
estimated source articulation rate
```

For example:

```text
Target: 8 syllables per second

Speaker: 3 syllables/s → approximately 2.67×
Speaker: 4 syllables/s → approximately 2.00×
Speaker: 5 syllables/s → approximately 1.60×
Speaker: 6 syllables/s → approximately 1.33×
Speaker: 8 syllables/s → approximately 1.00×
```

These values are illustrative. The user should be able to tune the target.

---

# 3. Critical Concept: Articulation Rate, Not Speech Density

There are two different quantities that must not be confused.

## Speech density

```text
syllables
/
total video time, including silence
```

## Articulation rate

```text
syllables
/
time during which the speaker is actively speaking
```

This product should primarily control **articulation rate**.

A pause does not mean the speaker has suddenly begun articulating slowly. Therefore, ordinary gaps must not drive the controller toward maximum speed.

Suppose someone says a sentence quickly and then pauses:

```text
rapid speech → two-second pause → rapid speech
```

The system should detect that the articulation itself is rapid and choose an appropriate multiplier, perhaps 1.3×.

The pause should then also play at approximately 1.3× because the playback multiplier applies to the whole video.

The pause must not be independently removed, jumped over, or interpreted as zero syllables per second.

This is a central non-negotiable requirement.

---

# 4. What This Will Not Be

This distinction should be made explicit in the README, architecture, implementation, and user interface.

The extension is **not**:

- A silence skipper.
- A dead-air remover.
- A jump-cut generator.
- A system that races toward maximum speed whenever no speech is detected.
- A sponsor skipper.
- A fixed playback-speed preset.
- A system that changes speed solely based on volume.
- A system that treats quiet audio as slow speech.
- A semantic difficulty estimator.
- An AI tutor deciding whether content is conceptually difficult.
- A transcript summarizer.
- A cloud transcription service.
- A caption-dependent tool.
- A system designed merely to minimize video duration.
- A clone of Fwdly.
- A pile of unrelated playback heuristics.

Its purpose is narrower and more useful:

> Normalize the pace at which articulated speech reaches the listener.

---

# 5. Resolved Product Semantics

Unless testing gives a compelling reason to change them, implement the following semantics.

## Target rate

The target is the desired number of syllables delivered per real-world listening second **while speech is active**.

Call this:

```text
targetSyllablesPerSecond
```

## Analysis window

The user can select a lookback horizon:

```text
analysisWindowSeconds
```

This is measured in **source media time**, not wall-clock time.

A four-second window means approximately the previous four seconds of the original video timeline, regardless of whether the video is currently playing at 1× or 3×.

The window controls responsiveness:

- Short window: responds quickly but may react to sentence-level variation.
- Long window: steadier but slower to notice genuine changes in pace.

Start with a default around four seconds. Make it adjustable.

A sensible initial range might be:

```text
1.5 to 15 seconds
```

Do not hard-code the architecture around this exact range.

## Pauses

Ordinary pauses do not directly lower the articulation-rate estimate.

During a pause:

- Maintain the most recent trustworthy estimate.
- Maintain the surrounding playback multiplier.
- Do not accelerate toward the maximum.
- Do not reset to 1×.
- Do not jump forward.

## Insufficient evidence

When there is not enough recent speech to produce a trustworthy estimate:

```text
hold the previous reasonable playback target
```

Do not derive a new target from near-zero data.

---

# 6. High-Level Signal Path

```text
YouTube audio
    ↓
local audio capture
    ↓
speech activity detector
    ↓
syllable-nucleus detector
    ↓
events timestamped in source media time
    ↓
articulation-rate estimator
    ↓
confidence gate
    ↓
robust filtering
    ↓
desired playback speed
    ↓
minimum/maximum clamp
    ↓
deadband
    ↓
asymmetric rate limiter
    ↓
HTMLVideoElement.playbackRate
```

Keep the audio analysis and playback controller separate.

The controller should not care how syllables were detected. It should consume a stream of measurements such as:

```text
{
  mediaTime,
  articulationRate,
  confidence,
  activeSpeechDuration,
  syllableCount
}
```

That separation will allow the detector to be replaced or improved without rebuilding the controller.

---

# 7. Timing Must Be Based on Source Media Time

This is another non-negotiable requirement.

Do not measure natural speech pace solely against wall-clock time and then divide by the current playback speed as an afterthought.

Playback speed is part of the controlled output. Feeding it incorrectly back into the estimator creates a path toward instability.

Every syllable event should ultimately have a timestamp in the original video timeline:

```text
event.mediaTime
```

Speech-active duration should also be measured or reconstructed in source media time.

Conceptually:

```text
source articulation rate
=
detected syllables
/
active speech seconds on the source timeline
```

This estimate should be approximately independent of whether the video currently plays at 1×, 2×, or 3×.

---

# 8. Audio Capture: Treat This as the First Technical Risk

Before building the complete extension, prove that audio can be captured reliably from YouTube in Dia without breaking playback.

Test capture approaches in this order.

## Preferred approach

Capture audio directly from the page’s `<video>` element using the least intrusive reliable browser mechanism.

Possible approaches to investigate include:

- `HTMLMediaElement.captureStream()`
- `AudioContext.createMediaElementSource()`
- An injected page-world script connected to an `AudioWorklet`

Do not assume cross-origin behavior will work. Test it.

Verify:

- The detector receives real audio samples.
- The user still hears the video.
- Audio is not duplicated.
- Audio is not muted.
- Seeking still works.
- Changing videos still works.
- YouTube replacing the video element is handled.
- Playback at high speed still produces analyzable audio.

## Fallback approach

If direct media-element capture is unreliable, use Chromium tab audio capture.

This may require:

- `chrome.tabCapture`
- An offscreen extension document
- Explicit audio routing back to the output
- A user gesture to begin capture
- Additional permissions

This route is more complex and may introduce a capture indicator, so do not use it unless necessary.

## Output of this spike

Before implementing adaptive speed, produce a minimal diagnostics page or overlay showing:

```text
Audio captured: yes
RMS energy: ...
Speech probability: ...
Current video time: ...
Current playback rate: ...
```

Do not continue until audio acquisition is proven stable.

---

# 9. Speech Activity Detection

The detector needs to distinguish active speech from pauses well enough that pauses do not contaminate the articulation-rate denominator.

It does not need to understand words.

A first implementation may use local DSP:

- Speech-band filtering.
- Short-frame RMS or log-energy.
- Adaptive noise floor.
- Spectral information where useful.
- Attack and release smoothing.
- A speech-probability value rather than only a brittle Boolean.
- Hysteresis around speech start and stop.

Use an `AudioWorklet` if practical so audio processing is not dependent on the responsiveness of the page’s main JavaScript thread.

The speech detector should output something like:

```text
{
  mediaTimeStart,
  mediaTimeEnd,
  speechProbability
}
```

Do not let a few low-energy consonants split every sentence into tiny speech fragments.

---

# 10. Syllable-Nucleus Detection

The goal is not perfect linguistic transcription.

The goal is a stable, monotonic estimate of how quickly syllables are being articulated.

A practical detector can look for vowel-like energy peaks or sonority peaks within active speech.

Possible initial stages:

1. Band-limit the audio to the useful speech region.
2. Calculate a smoothed energy or sonority envelope.
3. Maintain an adaptive baseline.
4. Identify meaningful local peaks.
5. Reject peaks below a confidence threshold.
6. Merge peaks that are too close in source media time.
7. Emit syllable-nucleus candidates.

The refractory period between syllable candidates must be expressed in **source media time**, or adjusted for playback speed.

A hard-coded 100 ms wall-clock refractory period may work at 1× and fail at 3× because source syllables arrive three times faster in wall time.

Detector output should resemble:

```text
{
  mediaTime,
  confidence
}
```

Absolute accuracy is less important than:

- Stability.
- Consistent behavior across playback speeds.
- Consistent behavior across speakers.
- Lack of runaway under noise or silence.
- Reasonable responsiveness when articulation genuinely changes.

A detector that consistently undercounts by 10% may still produce an excellent product if it is stable and the target slider is calibrated around its output.

Do not chase perfect phonological accuracy before testing perceptual usefulness.

---

# 11. Rate Estimation

Maintain a ring buffer containing:

- Syllable events.
- Speech-active intervals or frames.
- Media-time timestamps.
- Confidence values.

For the selected lookback window:

```text
windowStart = currentMediaTime - analysisWindowSeconds
windowEnd   = currentMediaTime
```

Estimate:

```text
rawArticulationRate
=
weighted syllable count
/
active source-speech duration
```

Ordinary silence should not be included in the denominator.

Require a minimum amount of evidence before updating. For example:

- Minimum number of syllable candidates.
- Minimum active speech duration.
- Minimum average confidence.

The exact thresholds must be tuned experimentally.

When evidence is insufficient:

```text
do not update the filtered articulation estimate
```

Hold the last valid estimate and target speed.

---

# 12. Robust Filtering

Raw measurements will be noisy.

Use at least two layers of stabilization.

A reasonable first design is:

```text
raw estimates
    ↓
median or trimmed-mean filter
    ↓
exponential moving average
```

The median stage should reject momentary false counts.

The EMA should smooth normal variation.

Do not make filtering so heavy that the extension takes fifteen seconds to notice a genuinely faster speaker.

Expose the analysis window to the user. Keep lower-level filter constants in an advanced diagnostics panel or configuration file initially.

Potential initial values:

```text
Measurement update frequency: 5–10 Hz
Median history:               3–5 samples
EMA alpha:                    0.15–0.3
```

Treat these only as starting points.

---

# 13. Playback Controller

Given:

```text
T = target delivered syllables per second
Q = filtered source articulation rate
```

Calculate:

```text
desiredRate = T / Q
```

Then:

```text
desiredRate = clamp(
  desiredRate,
  minimumPlaybackRate,
  maximumPlaybackRate
)
```

Do not update when `Q` is missing, stale, or low-confidence.

---

# 14. Deadband

The playback rate must not twitch continuously.

Use either a small absolute deadband or, preferably, a relative/multiplicative deadband.

For example:

```text
current target: 1.80×
new estimate:   1.85×
```

That may not justify a visible change.

A starting deadband around 4–6% is reasonable.

The deadband should apply before the rate limiter.

---

# 15. Asymmetric Rate Limiting

Playback-speed changes must glide.

Speeding up and slowing down should have separate limits.

Start approximately around:

```text
Maximum acceleration: +0.20× to +0.30× per wall second
Maximum deceleration: -0.35× to -0.50× per wall second
```

Slowing down should generally be faster than speeding up.

Reason:

- If a lecturer suddenly begins a dense, rapid derivation, reducing speed promptly protects comprehension.
- If the lecturer becomes slow, taking another second to accelerate is not costly.

Rate limiting should operate against wall-clock time because it controls what the listener perceives.

The controller must never jump directly from something like:

```text
1.3× → 3.2×
```

---

# 16. Controller State Machine

Use explicit states rather than scattered conditions.

Recommended states:

```text
DISABLED
WARMING_UP
TRACKING
HOLDING_LOW_CONFIDENCE
PAUSED
SEEK_RECOVERY
VIDEO_CHANGED
```

## Warming up

Collect enough speech evidence before calculating a target.

Maintain the user’s previous speed or a configurable startup speed during this period.

## Tracking

Normal adaptive operation.

## Holding low confidence

Maintain the previous valid target. Do not accelerate.

## Paused

Stop estimator and controller updates while preserving state.

## Seek recovery

When the user seeks:

- Clear stale audio events.
- Keep the current reasonable speed temporarily.
- Re-enter warming-up mode.
- Do not calculate across the discontinuity.

## Video changed

Reset buffers and acquire the new video element.

YouTube is a single-page application. URL changes may not reload the page. Handle this properly.

---

# 17. High-Speed Operation

Test specifically at:

```text
1×
1.5×
2×
2.5×
3×
3.5×
4×
```

The detector must not progressively undercount at higher playback speeds.

A dangerous failure mode is:

```text
high playback speed
→ detector misses syllables
→ inferred source speech becomes slower
→ controller increases speed
→ detector misses more syllables
→ runaway to maximum
```

The architecture must explicitly prevent this.

Defences include:

- Media-time event timestamps.
- Media-time refractory periods.
- Confidence gating.
- Holding when detection quality drops.
- Speed caps.
- Rate limiting.
- Offline high-speed detector tests.
- No update from insufficient evidence.

Stability matters more than aggressiveness.

---

# 18. User Interface

Keep the primary interface small.

## Main controls

```text
Adaptive Speech Rate          ON / OFF

Target articulation rate      8.0 syllables/s
Analysis window               4.0 seconds

Minimum speed                 0.8×
Maximum speed                 3.5×
```

## Diagnostics toggle

```text
Show diagnostics              ON / OFF
```

## Diagnostics overlay

When enabled, show something like:

```text
Source articulation:   4.2 syl/s
Filtered articulation: 4.0 syl/s
Target delivery:       8.0 syl/s

Desired speed:         2.00×
Actual speed:          1.84×
Speech confidence:     0.87
Syllables in window:   17
Active speech time:    4.1 s
Controller state:      TRACKING
```

The diagnostics overlay is essential during development.

The finished product may hide most of it by default.

---

# 19. Important UX Behaviour

## When enabled

The extension owns the playback rate.

## When disabled

Stop controlling the video and leave it at its current rate unless testing reveals that restoring the pre-extension rate is more intuitive.

## Manual YouTube speed changes

For the first version, choose a simple, explicit behaviour and document it.

Recommended initial behaviour:

- A manual YouTube speed change temporarily disables adaptation for that video.
- The extension shows that it has been paused by manual override.
- The user can re-enable it from the extension.

A later version may interpret manual speed selection as an adjustment to target syllables per second.

## Settings persistence

Persist:

- Enabled state.
- Target rate.
- Analysis window.
- Minimum speed.
- Maximum speed.
- Diagnostics visibility.

Use local extension storage.

---

# 20. Privacy and Permissions

The project should be local-first.

Preferred properties:

- Audio processed locally.
- No audio uploaded.
- No account.
- No analytics by default.
- No cloud service.
- No transcript sent externally.
- No page contents collected.
- Permissions limited to what is technically necessary.
- Host permissions limited to YouTube initially.

Document every permission in the README.

If tab capture is required, explain why.

---

# 21. Recommended Repository Structure

Use a clean TypeScript project.

A reasonable structure is:

```text
adaptive-speech-rate/
├── manifest.json
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONTROL_MODEL.md
│   ├── TUNING.md
│   ├── PRIVACY.md
│   └── EXPERIMENTS.md
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   ├── youtube-entry.ts
│   │   ├── video-lifecycle.ts
│   │   └── diagnostics-overlay.ts
│   ├── audio/
│   │   ├── audio-capture.ts
│   │   ├── audio-worklet.ts
│   │   ├── speech-detector.ts
│   │   └── syllable-detector.ts
│   ├── estimation/
│   │   ├── event-buffer.ts
│   │   ├── articulation-estimator.ts
│   │   └── confidence-gate.ts
│   ├── control/
│   │   ├── adaptive-controller.ts
│   │   ├── rate-limiter.ts
│   │   └── controller-state.ts
│   ├── settings/
│   │   ├── settings.ts
│   │   └── storage.ts
│   └── ui/
│       ├── popup.html
│       ├── popup.ts
│       └── popup.css
├── tests/
│   ├── controller/
│   ├── estimation/
│   ├── simulation/
│   └── fixtures/
└── tools/
    └── controller-simulator/
```

This is a suggested separation, not a requirement to create unnecessary files.

Use a minimal build system. Avoid framework bloat.

---

# 22. Build the Controller Simulator Before Closing the Loop

Before connecting the controller to a real video, build a small deterministic simulation harness.

The simulator should feed artificial source articulation patterns into the estimator/controller.

Example scenarios:

## Constant slow speaker

```text
Source articulation: 3 syl/s
Target:              8 syl/s
Expected rate:        approximately 2.67×
```

## Constant fast speaker

```text
Source articulation: 7 syl/s
Target:              8 syl/s
Expected rate:        approximately 1.14×
```

## Sudden increase

```text
0–20 s: 3 syl/s
20–40 s: 7 syl/s
```

Expected behaviour:

- Rate initially converges near 2.67×.
- At 20 seconds, rate decreases smoothly.
- No severe overshoot.
- Deceleration respects its configured limit.

## Sudden decrease

```text
0–20 s: 7 syl/s
20–40 s: 3 syl/s
```

Expected behaviour:

- Acceleration is slower than deceleration.
- No jump to maximum.

## Pause

```text
Speech at 4 syl/s
5-second pause
Speech resumes at 4 syl/s
```

Expected behaviour:

- Playback target holds through the pause.
- No acceleration caused by silence.
- Tracking resumes smoothly.

## Detector dropout

Simulate missing syllable events while confidence drops.

Expected behaviour:

- Hold previous target.
- Never infer a near-zero articulation rate.
- Never run to maximum speed.

## False detection burst

Inject an implausible syllable-count spike.

Expected behaviour:

- Median/outlier filtering suppresses it.
- Playback speed does not sharply drop.

## Seek

Jump media time forward several minutes.

Expected behaviour:

- Old events are discarded.
- Controller enters warm-up.
- No calculation spans the discontinuity.

This simulator is the fastest way to prove controller stability independently from audio-detection quality.

---

# 23. Execution Order

Follow this sequence.

## Milestone 0: Lock the specification

Create:

```text
docs/ARCHITECTURE.md
docs/CONTROL_MODEL.md
```

Translate this brief into explicit interfaces and state transitions.

Do not start with visual polish.

### Exit condition

The equations, timing domains, pause behaviour, confidence behaviour, and state machine are documented.

---

## Milestone 1: Controller simulator

Implement the rate estimator, confidence gate, deadband, clamp, state machine, and rate limiter against synthetic syllable-event streams.

### Exit condition

All simulation scenarios pass and no scenario can produce uncontrolled acceleration.

---

## Milestone 2: YouTube video lifecycle

Reliably locate the active video element and handle:

- Initial page load.
- YouTube navigation.
- New videos.
- Seeking.
- Pausing.
- Ads.
- Video-element replacement.
- User-selected playback changes.

### Exit condition

A debug overlay can accurately show current video time, rate, pause state, URL changes, and seek events.

---

## Milestone 3: Audio-capture spike

Prove local audio access in Dia.

### Exit condition

Stable energy and spectral measurements are visible while the video remains audible and usable.

If direct media-element capture fails, document the failure and implement the tab-capture fallback.

---

## Milestone 4: Speech and syllable diagnostics

Implement speech activity and syllable-nucleus detection without controlling playback yet.

Compare detector output while manually switching through several speeds.

### Exit condition

The estimated source articulation rate remains reasonably consistent for the same passage at different playback speeds.

This is a crucial test.

For example, the same speaker segment should not measure:

```text
1× playback:  4.2 syl/s
2× playback:  3.0 syl/s
3× playback:  1.8 syl/s
```

That would indicate a detector/timing failure.

---

## Milestone 5: Closed-loop integration

Connect the detector to the tested controller.

Start with conservative defaults.

### Exit condition

Real YouTube videos adapt smoothly, pauses do not cause acceleration, and the controller does not become stuck at a speed boundary.

---

## Milestone 6: Tuning

Tune using representative learning content:

- Slow lectures.
- Fast technical videos.
- Conversational interviews.
- Speakers who change pace.
- Different microphones.
- Background noise.
- Accents.
- At least some non-English speech if practical.

At this stage, ask me for representative videos I actually use.

### Exit condition

The extension can run for at least one hour without runaway, excessive twitching, or requiring constant correction.

---

## Milestone 7: Public-ready cleanup

Add:

- Installation instructions for loading the unpacked extension.
- Architecture overview.
- Privacy statement.
- Tuning documentation.
- Known limitations.
- Screenshots.
- MIT license unless there is a reason to choose another permissive license.

Prepare for a public repository, but confirm the exact repository name and visibility immediately before publishing.

---

# 24. Testing Requirements

## Unit tests

Test:

- Rate calculation.
- Media-time windowing.
- Active-speech denominator.
- Confidence gating.
- Deadband.
- Minimum and maximum clamps.
- Acceleration limit.
- Deceleration limit.
- Pause handling.
- Seek reset.
- Stale-data rejection.
- State transitions.

## Simulation tests

Test long-running control behaviour, not only isolated functions.

At minimum, run simulated sessions equivalent to several hours and assert:

- Playback rate remains finite.
- Playback rate remains inside bounds.
- Low confidence never drives the rate upward.
- No stale estimate survives a seek.
- No false event can cause a large instantaneous speed change.

## Audio fixture tests

Use public-domain, permissively licensed, synthetic, or self-recorded samples suitable for a public repository.

Do not commit copyrighted YouTube audio.

For each fixture, store expected approximate syllable counts or articulation-rate ranges.

## Manual tests

Use a repeatable checklist covering:

- Dia.
- YouTube normal videos.
- Seeking.
- Pausing.
- Resuming.
- Changing videos.
- Changing tabs.
- Fullscreen.
- Picture-in-picture if relevant.
- One-hour runtime.
- Multiple playback speed ranges.

---

# 25. Metrics Worth Recording

The diagnostics system should make tuning empirical.

Record or display:

```text
Estimated source articulation rate
Target delivered articulation rate
Predicted delivered articulation rate
Actual playback rate
Desired playback rate
Speech-active fraction
Detector confidence
Syllable candidates per window
Controller state
Time at minimum speed
Time at maximum speed
Number of manual overrides
```

Useful quantitative measures include:

## Target error

```text
estimated delivered rate
=
estimated source articulation rate × actual playback rate
```

Compare this with the target.

## Convergence time

How long does it take to settle after a genuine speaker-rate change?

## Overshoot

How far does playback speed pass beyond the appropriate value?

## Speed movement

How often and how sharply does playback rate change?

## Boundary occupancy

How much time does the controller spend pinned at minimum or maximum?

Frequent unexplained maximum-speed occupancy is a major failure signal.

## Manual correction rate

How often do I feel compelled to disable or adjust the extension?

This is probably a more useful product metric than perfect syllable-count accuracy.

---

# 26. Initial Parameter Defaults

Use conservative defaults.

Suggested starting values:

```text
Target delivered rate:       8.0 syllables/s
Analysis window:             4.0 source seconds
Minimum playback rate:       0.8×
Maximum playback rate:       3.25×
Relative deadband:           5%
Maximum acceleration:        +0.25× per wall second
Maximum deceleration:        -0.40× per wall second
Estimator update rate:       5–10 Hz
Minimum syllables to update: 3
```

These are experimental starting values, not final answers.

Do not bury them as magic numbers. Place them in a typed configuration object with comments.

---

# 27. Likely Failure Modes

Design and test explicitly for these.

## Detector undercounts at high playback speed

Result: positive feedback toward maximum speed.

## Silence interpreted as slow articulation

Result: maximum-speed collapse during pauses.

## Stale events survive seeking

Result: nonsensical rate after jumping to another point.

## YouTube replaces the video element

Result: extension silently stops working or controls an obsolete element.

## Audio capture mutes or duplicates playback

Result: unacceptable user experience.

## Rapid noise produces false syllables

Result: unnecessary slowdown.

## Quiet speaker produces low confidence

Result: controller should hold, not accelerate.

## Music is interpreted as speech

Result: hold or suspend adaptive updates when speech confidence is poor.

## Controller fights manual input

Result: user frustration. Make override behaviour explicit.

## Tiny estimate changes cause constant speed movement

Result: perceptual twitchiness. Use deadband and filtering.

## Excessive filtering

Result: controller reacts too late to rapid technical sections.

---

# 28. Future Features That Are Explicitly Out of Scope for Version 1

Do not implement these until the core controller is excellent:

- Silence skipping.
- Semantic difficulty analysis.
- Automatic transcript summarization.
- Per-channel profiles.
- Cloud sync.
- Mobile support.
- Safari support.
- Sponsor detection.
- Music-specific playback modes.
- Per-speaker voice identification.
- Automatic comprehension testing.
- Machine-learning personalization.
- Automatic target optimization.
- Caption-based semantic analysis.
- Cross-device accounts.

Potential future improvements may include:

- Caption-assisted syllable estimates.
- Language-specific detector calibration.
- A fast/slow dual-window estimator.
- Keyboard shortcuts for target rate.
- Per-site support beyond YouTube.
- A calibration mode.
- Optional session statistics.

But none of these should delay a stable first version.

---

# 29. Product Success Criteria

The project succeeds when all of the following are true:

1. I can select a target syllable rate and analysis window.
2. Slow speakers are accelerated.
3. Fast speakers are slowed.
4. Ordinary pauses do not cause special acceleration.
5. Pauses remain in the video and are simply affected by the current multiplier.
6. Speed changes feel smooth rather than twitchy.
7. The same passage produces approximately the same source articulation estimate at different playback speeds.
8. Seeking and changing videos do not corrupt the estimator.
9. The extension can operate for an hour without collapsing to maximum speed.
10. The implementation is understandable enough to publish publicly.
11. Audio remains entirely local.
12. I spend less time manually changing playback speed while learning.

The deepest success criterion is:

> I stop thinking about playback speed and remain inside the useful cognitive rhythm of the material.

---

# 30. Instructions to the Implementation Model

Treat this document as the controlling brief.

Do not begin by throwing together a full extension in one pass.

Proceed in this order:

1. Restate the core control problem in precise technical language.
2. Identify any remaining ambiguity that materially affects the architecture.
3. Produce the proposed component interfaces and state machine.
4. Build the deterministic controller simulator.
5. Prove its stability under silence, dropouts, rate changes, and seeks.
6. Prove YouTube audio capture in Dia.
7. Implement the detector with diagnostics before enabling playback control.
8. Validate detector invariance across playback speeds.
9. Integrate the closed loop conservatively.
10. Tune it using real learning videos.
11. Document every important design decision.

Do not overengineer the UI.

Do not introduce cloud services.

Do not treat silence as zero-rate speech.

Do not allow low confidence to increase playback speed.

Do not use instantaneous playback speed to naively correct a historical wall-time estimate.

Do not optimize for shortening videos at the expense of comprehension.

When there is a choice between a more aggressive controller and a more stable controller, choose stability.

Maintain these documents throughout development:

```text
docs/ARCHITECTURE.md
docs/CONTROL_MODEL.md
docs/EXPERIMENTS.md
docs/TUNING.md
```

For every tuning change, record:

- Parameter changed.
- Old value.
- New value.
- Why it was changed.
- Test material used.
- Observed improvement.
- Observed regression.
- Whether the change should remain.

The implementation should remain modular enough that the syllable detector can later be replaced without rewriting the controller.

---

# 31. First Response Expected From the Implementation Model

Before writing substantial code, respond with:

1. A concise understanding of the product.
2. A clear explanation of articulation rate versus speech density.
3. The proposed timing model.
4. The planned audio-capture experiment.
5. The rate-estimator interface.
6. The controller state machine.
7. The simulator test scenarios.
8. The proposed repository layout.
9. The first concrete implementation milestone.
10. Any genuinely blocking question.

The first milestone should be small enough to inspect and test independently.

The intended system is not “smart fast-forward.”

It is:

> A stable, local controller that listens to how quickly a person is articulating speech and continuously chooses a video multiplier that delivers that speech at the learner’s preferred pace.