# Adaptive Speech Rate

A local-first Chromium extension that aims to deliver active speech at a user-selected syllable rate by continuously adjusting YouTube playback speed.

This is not a silence skipper. Pauses stay in the media and play at the surrounding multiplier. Missing or low-confidence evidence holds the last trustworthy target instead of accelerating.

## Current state

Direct capture, lifecycle handling, the persistent music switch, detector speed-invariance, and the complete closed loop have passed initial checks in a Chromium-based browser. Automated tests cover controller dynamics and synthetic detector behaviour. Real-world tuning and cross-video validation remain early.

## Install

Download and unzip the latest GitHub release, then load its directory as an unpacked extension in a Chromium browser. Until a store package exists, updates are manual.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run check
npm run build
npm run simulate
```

Load `dist/` as an unpacked extension. Press **Start** in the compact YouTube-page pill while a video is playing. After accepted speech evidence, playback glides toward `target articulation / filtered source articulation`, constrained by the configured minimum and maximum speeds. Click the pill's speed/state readout to expand diagnostics.

Use **ON/OFF** in the pill as the one-click music switch. Off stops capture and releases playback control without changing the current speed; the pill remains visible and grayed. Press the same button to resume immediately. A manual YouTube speed change also switches adaptive mode off.

Click the extension's speedometer toolbar icon to edit target articulation, source-time analysis window, and playback-rate bounds. The icon also replaces YouTube's tab favicon while adaptive mode is enabled. Deadband, confidence gate, filtering, and slew limits remain fixed safety dynamics.

See [Architecture](docs/ARCHITECTURE.md), [Control model](docs/CONTROL_MODEL.md), [manual testing](docs/TESTING.md), and [experiments](docs/EXPERIMENTS.md).

## Current limitations

- YouTube only; direct capture depends on Chromium exposing `HTMLMediaElement.captureStream()`.
- Speech/syllable detection is acoustic and approximate, not transcript-based.
- A user gesture starts capture, and navigation to a new video requires another **Start**.
- Initial tuning was performed in a Chromium-based browser on macOS; broader browser and content coverage is unverified.

## Privacy

Audio analysis runs locally. No audio, transcript, or page content is uploaded. The only API permission is `storage`, used for local controller settings. Host access is limited to YouTube. See [Privacy](PRIVACY.md).
