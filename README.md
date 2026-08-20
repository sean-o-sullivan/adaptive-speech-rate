# Adaptive Speech Rate

Automatic speech-speed control for YouTube.

Playback speed is a blunt instrument. A fast speaker at 2× can become
unintelligible, while a slow speaker at the same setting still drags. I wanted
to choose how quickly I hear spoken words, rather than keep adjusting a
multiplier for every video, so I made this extension.

Set the speech rate you want. The extension listens locally, estimates how
quickly the speaker is talking, and gently adjusts YouTube's playback speed to
compensate. Pauses remain pauses. When music starts, switch it off from the
on-video control without making the control disappear.

## Requirements

- A Chromium-based browser with `HTMLMediaElement.captureStream()` support
- YouTube

Initial testing was performed on macOS. Broader browser and content coverage is
still limited.

## Install

Download and unzip the latest GitHub release. Open your browser's extensions
page, enable developer mode, choose **Load unpacked**, and select the unzipped
directory.

Until a browser-store package exists, updates are manual.

## Use

Click the extension's speedometer icon to set your target speech rate, analysis
window, and minimum and maximum playback speeds.

Start a YouTube video, then press **Start** in the small on-video control. Once
the detector has enough reliable speech evidence, playback glides toward the
configured target. Click the speed readout to expand the live diagnostics.

Press **ON/OFF** to stop adaptive control for music. Audio capture stops and the
control stays visible but grayed out. Press it again to resume. Changing speed
manually through YouTube also switches adaptive control off.

Starting a different video currently requires pressing **Start** again.

## What audio access does

The extension captures audio directly from the YouTube video and analyses it
locally. It does not upload audio, transcripts, or page content, and it does not
use telemetry.

The only extension API permission is `storage`, used for local settings. Host
access is limited to YouTube. See [Privacy](PRIVACY.md).

## How it works

The detector estimates active speech time and syllable nuclei in source-media
time. A confidence gate rejects weak evidence. Accepted estimates pass through
a robust filter before the controller adjusts playback using deadband, bounds,
and asymmetric slew limits.

This is not a silence skipper. Pauses play at the surrounding multiplier, and
missing or low-confidence evidence holds the last trustworthy target instead of
accelerating.

See [Architecture](docs/ARCHITECTURE.md),
[Control model](docs/CONTROL_MODEL.md), [manual testing](docs/TESTING.md), and
[experiments](docs/EXPERIMENTS.md).

## Limitations

- YouTube only.
- Speech and syllable detection is acoustic and approximate, not
  transcript-based.
- A user gesture is required to begin capture.
- Navigating to another video requires another **Start**.
- Real-world tuning and cross-video validation are still early.

## Development

Requires Node.js 22 or newer.

```sh
npm install
npm run check
npm run build
npm run simulate
```

Load `dist/` as an unpacked extension.

## Licence

[MIT](LICENSE)
