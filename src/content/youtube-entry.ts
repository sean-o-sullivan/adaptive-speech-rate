import { AudioCaptureProbe } from "../audio/audio-capture-probe.js";
import { SpeechAnalysisPipeline } from "../audio/speech-analysis-pipeline.js";
import {
  AdaptiveController,
  type ControllerOutput,
} from "../control/adaptive-controller.js";
import { ControllerState } from "../control/controller-state.js";
import {
  controllerConfigFromSettings,
  loadSettings,
  onSettingsChanged,
  setEnabled,
  type Settings,
} from "../settings/settings.js";
import { DiagnosticsOverlay } from "./diagnostics-overlay.js";
import { AdaptiveTabFavicon } from "./tab-favicon.js";
import {
  VideoLifecycle,
  type VideoLifecycleEventKind,
} from "./video-lifecycle.js";

declare global {
  interface Window {
    __adaptiveSpeechRateCleanup?: () => void;
  }
}

window.__adaptiveSpeechRateCleanup?.();

interface AdaptiveRuntime {
  readonly setSettings: (settings: Settings) => void;
  readonly stop: () => void;
}

let runtime: AdaptiveRuntime | undefined;
let disposed = false;
let settingsRevision = 0;

function applySettings(settings: Settings): void {
  runtime ??= startAdaptiveRuntime(settings);
  runtime.setSettings(settings);
}

function startAdaptiveRuntime(initialSettings: Settings): AdaptiveRuntime {
  const detector = new SpeechAnalysisPipeline();
  const audioProbe = new AudioCaptureProbe((frame) => detector.process(frame));
  const tabFavicon = new AdaptiveTabFavicon(
    chrome.runtime.getURL("icons/icon32.png"),
  );
  let settings = initialSettings;
  let controller = new AdaptiveController(
    controllerConfigFromSettings(settings),
  );
  let lastOutput: ControllerOutput | undefined;
  let lastEvent: VideoLifecycleEventKind | "none" = "none";
  let adaptiveRunning = false;
  let startRevision = 0;
  let lastAdShowing = false;
  let controllerWrite:
    | {
        readonly video: HTMLVideoElement;
        readonly rate: number;
        readonly expiresAt: number;
      }
    | undefined;

  detector.setAnalysisWindowSeconds(settings.analysisWindowSeconds);
  tabFavicon.setActive(settings.enabled);

  const stopAdaptive = (): void => {
    startRevision += 1;
    audioProbe.stop();
    detector.reset();
    const video = lifecycle.video();
    controller.disable(video?.playbackRate ?? 1);
    controllerWrite = undefined;
    lastOutput = undefined;
    adaptiveRunning = false;
  };

  const suspendForVideoChange = (): void => {
    startRevision += 1;
    audioProbe.stop();
    detector.reset();
    controller.notifyVideoChanged();
    controllerWrite = undefined;
    lastOutput = undefined;
    adaptiveRunning = false;
  };

  const startAdaptive = async (): Promise<void> => {
    if (!settings.enabled) return;
    const video = lifecycle.video();
    if (video === undefined) return;

    startRevision += 1;
    const revision = startRevision;
    audioProbe.stop();
    detector.reset();
    detector.setAnalysisWindowSeconds(settings.analysisWindowSeconds);
    controller = new AdaptiveController(
      controllerConfigFromSettings(settings),
      video.playbackRate,
    );
    controllerWrite = undefined;
    lastOutput = undefined;
    adaptiveRunning = false;

    try {
      await audioProbe.start(video);
      if (
        revision !== startRevision ||
        !settings.enabled ||
        lifecycle.video() !== video
      ) {
        audioProbe.stop();
        return;
      }
      controller.enable(video.playbackRate, wallTime());
      adaptiveRunning = true;
    } catch {
      controller.disable(video.playbackRate);
      adaptiveRunning = false;
    }
  };

  const applyRuntimeSettings = (nextSettings: Settings): void => {
    const controllerSettingsChanged =
      settings.targetSyllablesPerSecond !==
        nextSettings.targetSyllablesPerSecond ||
      settings.analysisWindowSeconds !== nextSettings.analysisWindowSeconds ||
      settings.minimumPlaybackRate !== nextSettings.minimumPlaybackRate ||
      settings.maximumPlaybackRate !== nextSettings.maximumPlaybackRate;
    const wasRunning = adaptiveRunning;
    settings = nextSettings;
    tabFavicon.setActive(settings.enabled);
    detector.setAnalysisWindowSeconds(settings.analysisWindowSeconds);

    if (!settings.enabled) {
      stopAdaptive();
      return;
    }

    if (controllerSettingsChanged && wasRunning) {
      const video = lifecycle.video();
      detector.reset();
      controller = new AdaptiveController(
        controllerConfigFromSettings(settings),
        video?.playbackRate ?? 1,
      );
      if (video !== undefined) controller.enable(video.playbackRate, wallTime());
      controllerWrite = undefined;
      lastOutput = undefined;
      adaptiveRunning = video !== undefined;
    }
  };

  const disableFromOverlay = (): void => {
    const nextSettings = { ...settings, enabled: false };
    applyRuntimeSettings(nextSettings);
    void setEnabled(false);
  };

  const enableAndStartFromOverlay = (): void => {
    const nextSettings = { ...settings, enabled: true };
    applyRuntimeSettings(nextSettings);
    void setEnabled(true);
    void startAdaptive();
  };

  const lifecycle = new VideoLifecycle((event) => {
    lastEvent = event.kind;
    if (event.kind === "video-changed" || event.kind === "navigation") {
      tabFavicon.setActive(settings.enabled);
      suspendForVideoChange();
      return;
    }
    if (event.kind === "seeking") {
      detector.reset();
      controller.notifySeek();
      return;
    }
    if (event.kind !== "rate-changed" || !adaptiveRunning) return;

    const video = event.video;
    const write = controllerWrite;
    const isControllerWrite =
      video !== undefined &&
      write !== undefined &&
      write.video === video &&
      wallTime() <= write.expiresAt &&
      Math.abs(video.playbackRate - write.rate) < 0.001;
    if (isControllerWrite) {
      controllerWrite = undefined;
      return;
    }

    if (!lifecycle.snapshot().adShowing) disableFromOverlay();
  });

  const overlay = new DiagnosticsOverlay(
    () => void startAdaptive(),
    () => {
      if (settings.enabled) disableFromOverlay();
      else enableAndStartFromOverlay();
    },
  );

  lifecycle.start();
  const updateTimer = window.setInterval(() => {
    const video = lifecycle.video();
    const videoSnapshot = lifecycle.snapshot();
    if (videoSnapshot.adShowing !== lastAdShowing) {
      lastAdShowing = videoSnapshot.adShowing;
      detector.reset();
      controller.notifySeek();
    }

    const detectorSnapshot = detector.snapshot();
    if (adaptiveRunning && video !== undefined) {
      lastOutput = controller.tick({
        wallTime: wallTime(),
        currentPlaybackRate: video.playbackRate,
        paused: video.paused || video.seeking || videoSnapshot.adShowing,
        ...(detectorSnapshot.measurement === undefined
          ? {}
          : { measurement: detectorSnapshot.measurement }),
      });

      if (
        lastOutput.shouldApplyPlaybackRate &&
        !video.paused &&
        !video.seeking &&
        !videoSnapshot.adShowing
      ) {
        controllerWrite = {
          video,
          rate: lastOutput.commandedPlaybackRate,
          expiresAt: wallTime() + 0.75,
        };
        video.playbackRate = lastOutput.commandedPlaybackRate;
      }
    }

    overlay.update({
      enabled: settings.enabled,
      video: videoSnapshot,
      audio: audioProbe.snapshot(),
      detector: detectorSnapshot,
      lastEvent,
      controller: {
        running: adaptiveRunning,
        state: settings.enabled ? controller.state() : ControllerState.Disabled,
        output: lastOutput,
      },
    });
  }, 100);

  return {
    setSettings: applyRuntimeSettings,
    stop: () => {
      window.clearInterval(updateTimer);
      stopAdaptive();
      lifecycle.stop();
      tabFavicon.remove();
      overlay.remove();
    },
  };
}

const unsubscribe = onSettingsChanged((settings) => {
  settingsRevision += 1;
  applySettings(settings);
});
const initialSettingsRevision = settingsRevision;
void loadSettings().then((settings) => {
  if (!disposed && settingsRevision === initialSettingsRevision) {
    applySettings(settings);
  }
});

window.__adaptiveSpeechRateCleanup = () => {
  disposed = true;
  unsubscribe();
  runtime?.stop();
  runtime = undefined;
  delete window.__adaptiveSpeechRateCleanup;
};

function wallTime(): number {
  return performance.now() / 1000;
}
