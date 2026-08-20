# Control Model

## Quantity being controlled

```text
source articulation rate = detected syllable weight / active source-speech seconds
desired playback rate    = target delivered rate / filtered source articulation rate
```

Speech density is not used. Silence contributes neither syllables nor denominator time. When evidence expires during a pause, the estimator becomes invalid and the controller retains its last trustworthy target.

## Estimation

The estimator retains syllable candidates and speech-active intervals in source media time. For `[mediaTime - analysisWindow, mediaTime]`, it:

1. clips and unions speech intervals;
2. sums candidate confidence as syllable weight;
3. divides weighted syllables by active duration;
4. reports candidate count, evidence age, and conservative combined confidence.

The confidence gate rejects measurements with too few candidates, too little active speech, low confidence, stale evidence, non-finite values, or implausible articulation rates.

Valid raw rates pass through a short median history and then an EMA. Seek and video-change notifications clear filter history.

## Controller

```text
candidate = clamp(targetSyllablesPerSecond / filteredRate, minRate, maxRate)
```

A multiplicative deadband compares the candidate with the last trustworthy target. Changes outside the band replace that target. Actual playback approaches it through asymmetric wall-time slew limits; deceleration is faster than acceleration.

Invalid evidence never creates a new target. The limiter may finish approaching a target already justified by earlier evidence.

The browser runtime ticks the controller every 100 ms. It does not write during warm-up, pause, seek, or ads. A controller-authored speed change is tracked so its resulting `ratechange` event is not mistaken for a user override. Any other YouTube speed change immediately disables the loop and leaves that selected speed intact.

## States

- `DISABLED`: no ownership of playback rate.
- `WARMING_UP`: enabled, awaiting sufficient evidence.
- `TRACKING`: valid evidence is updating the control path.
- `HOLDING_LOW_CONFIDENCE`: evidence rejected; target held.
- `PAUSED`: controller updates suspended; state retained.
- `SEEK_RECOVERY`: stale estimator/filter state cleared; target held until fresh evidence.
- `VIDEO_CHANGED`: previous media evidence cleared; target held until fresh evidence.

## State transitions

```text
DISABLED --enable--> WARMING_UP
WARMING_UP --valid--> TRACKING
TRACKING --invalid--> HOLDING_LOW_CONFIDENCE
HOLDING_LOW_CONFIDENCE --valid--> TRACKING
any enabled --pause--> PAUSED
PAUSED --resume/no evidence--> previous recovery state or HOLDING_LOW_CONFIDENCE
any enabled --seek--> SEEK_RECOVERY --fresh valid--> TRACKING
any enabled --new video--> VIDEO_CHANGED --fresh valid--> TRACKING
any --disable/manual override--> DISABLED
```

## Initial configuration

```text
Target delivered rate:       8.0 syllables/s
Analysis window:             4.0 source seconds
Minimum playback rate:       0.8x
Maximum playback rate:       3.25x
Relative deadband:           5%
Maximum acceleration:        +0.25x per wall second
Maximum deceleration:        -0.40x per wall second
Median history:              5 valid measurements
EMA alpha:                   0.22
Minimum candidates:          3
Minimum active speech:       0.75 source seconds
Minimum confidence:          0.60
Maximum evidence age:        1.25 source seconds
Plausible source-rate range: 1.0–12.0 syllables/s
```

These are explicit experimental defaults, not settled product values.

The extension popup exposes and persists target delivered rate, analysis window, and minimum/maximum playback rate. Changing one while running resets detector/filter evidence and returns the controller to warm-up. Deadband, slew limits, filter, and confidence-gate values remain fixed.
