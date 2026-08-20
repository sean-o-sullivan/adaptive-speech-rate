# Privacy

Adaptive Speech Rate processes audio locally in the browser.

- Audio from the active YouTube video is analyzed in memory and is not recorded, retained, or uploaded.
- No transcript or page content is collected or transmitted.
- Controller preferences are stored locally through Chromium's `storage` API.
- The extension makes no network requests of its own.
- Host access is limited to `https://www.youtube.com/*` so the content script can find and control the active video.

YouTube continues to receive the requests it normally receives when you use its website. This extension does not add analytics, telemetry, advertising, or cloud processing.
