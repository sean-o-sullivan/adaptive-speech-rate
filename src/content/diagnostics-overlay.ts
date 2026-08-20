import type { AudioProbeSnapshot } from "../audio/audio-capture-probe.js";
import type { SpeechAnalysisSnapshot } from "../audio/speech-analysis-pipeline.js";
import type { ControllerOutput } from "../control/adaptive-controller.js";
import type { ControllerState } from "../control/controller-state.js";
import type { VideoLifecycleEventKind, VideoSnapshot } from "./video-lifecycle.js";

export interface DiagnosticsSnapshot {
  readonly enabled: boolean;
  readonly video: VideoSnapshot;
  readonly audio: AudioProbeSnapshot;
  readonly detector: SpeechAnalysisSnapshot;
  readonly lastEvent: VideoLifecycleEventKind | "none";
  readonly controller: {
    readonly running: boolean;
    readonly state: ControllerState;
    readonly output: ControllerOutput | undefined;
  };
}

export class DiagnosticsOverlay {
  private readonly host = document.createElement("aside");
  private readonly root = this.host.attachShadow({ mode: "open" });
  private readonly bar = document.createElement("section");
  private readonly panel = document.createElement("section");
  private readonly values = new Map<string, HTMLElement>();
  private readonly summaryButton: HTMLButtonElement;
  private readonly summaryText = document.createElement("span");
  private readonly expandIndicator = document.createElement("span");
  private readonly startButton: HTMLButtonElement;
  private readonly toggleButton: HTMLButtonElement;
  private readonly note = document.createElement("p");
  private expanded = false;

  constructor(
    onStart: () => void,
    onToggle: () => void,
  ) {
    this.host.id = "adaptive-speech-rate-diagnostics";
    this.host.style.cssText =
      "all: initial; position: fixed; inset: 12px 12px auto auto; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;";

    const style = document.createElement("style");
    style.textContent = `
      :host { color-scheme: dark; }
      .bar { display: flex; align-items: center; gap: 5px; box-sizing: border-box; padding: 5px; border: 1px solid #4b5563; border-radius: 10px; background: #111827; box-shadow: 0 5px 18px rgba(0,0,0,.28); color: #f9fafb; font: 11px system-ui, sans-serif; }
      .bar.disabled { border-color: #374151; background: #1f2937; color: #9ca3af; filter: grayscale(1); }
      .summary { display: flex; align-items: center; gap: 6px; min-width: 0; border: 0; padding: 0 5px 0 0; background: transparent; color: #f9fafb; cursor: pointer; }
      .summary:hover { background: transparent; }
      .icon { width: 24px; height: 24px; border-radius: 6px; }
      .state { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
      .chevron { color: #9ca3af; }
      .panel { display: none; box-sizing: border-box; width: 340px; max-height: calc(100vh - 66px); overflow: auto; padding: 12px; border: 1px solid #4b5563; border-radius: 10px; background: #111827; box-shadow: 0 8px 30px rgba(0,0,0,.35); color: #f9fafb; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .panel.expanded { display: block; }
      .panel.disabled { border-color: #374151; background: #1f2937; }
      .panel.disabled dl { opacity: .38; filter: grayscale(1); }
      h1 { margin: 0 0 9px; font: 600 13px/1.2 system-ui, sans-serif; }
      dl { display: grid; grid-template-columns: 1fr auto; gap: 3px 12px; margin: 0; }
      dt { color: #9ca3af; }
      dd { margin: 0; text-align: right; max-width: 175px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      button { border: 1px solid #6b7280; border-radius: 6px; padding: 5px 8px; background: #1f2937; color: #f9fafb; font: 600 11px system-ui, sans-serif; cursor: pointer; }
      button:hover { background: #374151; }
      button.toggle[aria-pressed="true"] { border-color: #60a5fa; background: #1d4ed8; }
      button[hidden] { display: none; }
      .note { margin: 9px 0 0; color: #9ca3af; font: 11px/1.35 system-ui, sans-serif; }
    `;
    this.root.append(style);

    this.bar.className = "bar";
    this.summaryButton = document.createElement("button");
    this.summaryButton.type = "button";
    this.summaryButton.className = "summary";
    this.summaryButton.setAttribute("aria-expanded", "false");
    const icon = document.createElement("img");
    icon.className = "icon";
    icon.src = chrome.runtime.getURL("icons/icon32.png");
    icon.alt = "";
    this.summaryText.className = "state";
    this.summaryText.textContent = "Adaptive ready";
    this.expandIndicator.className = "chevron";
    this.expandIndicator.textContent = "▾";
    this.summaryButton.append(icon, this.summaryText, this.expandIndicator);
    this.summaryButton.addEventListener("click", () => {
      this.expanded = !this.expanded;
      this.panel.classList.toggle("expanded", this.expanded);
      this.summaryButton.setAttribute("aria-expanded", String(this.expanded));
      this.expandIndicator.textContent = this.expanded ? "▴" : "▾";
    });
    this.startButton = document.createElement("button");
    this.startButton.type = "button";
    this.startButton.textContent = "Start";
    this.startButton.addEventListener("click", onStart);
    this.toggleButton = document.createElement("button");
    this.toggleButton.type = "button";
    this.toggleButton.className = "toggle";
    this.toggleButton.addEventListener("click", onToggle);
    this.bar.append(this.summaryButton, this.startButton, this.toggleButton);
    this.root.append(this.bar);

    this.panel.className = "panel";
    const heading = document.createElement("h1");
    heading.textContent = "Adaptive Speech Rate — live controller";
    this.panel.append(heading);

    const list = document.createElement("dl");
    for (const [key, label] of ROWS) {
      const term = document.createElement("dt");
      term.textContent = label;
      const value = document.createElement("dd");
      value.textContent = "—";
      this.values.set(key, value);
      list.append(term, value);
    }
    this.panel.append(list);

    this.note.className = "note";
    this.panel.append(this.note);
    this.root.append(this.panel);
    document.documentElement.append(this.host);
  }

  update(snapshot: DiagnosticsSnapshot): void {
    this.bar.classList.toggle("disabled", !snapshot.enabled);
    this.panel.classList.toggle("disabled", !snapshot.enabled);
    this.summaryText.textContent = !snapshot.enabled
      ? "Adaptive off"
      : snapshot.controller.running
        ? `${snapshot.video.playbackRate.toFixed(2)}× · ${snapshot.controller.state.toLowerCase().replaceAll("_", " ")}`
        : `${snapshot.video.playbackRate.toFixed(2)}× · ready`;
    this.toggleButton.textContent = snapshot.enabled ? "ON" : "OFF";
    this.toggleButton.setAttribute("aria-pressed", String(snapshot.enabled));
    this.toggleButton.title = snapshot.enabled
      ? "Stop audio analysis and playback control"
      : "Resume adaptive analysis and playback control";
    this.note.textContent = snapshot.enabled
      ? snapshot.controller.running
        ? "Closed loop active. A manual YouTube speed change switches it off."
        : "Ready. Press Start; playback is currently unchanged."
      : "Off. No audio capture or playback control; press OFF to resume.";

    this.set("video", snapshot.video.found ? "yes" : "no");
    this.set("mediaTime", `${snapshot.video.mediaTime.toFixed(2)} s`);
    this.set("rate", `${snapshot.video.playbackRate.toFixed(2)}x`);
    this.set("paused", String(snapshot.video.paused));
    this.set("seeking", String(snapshot.video.seeking));
    this.set("ad", String(snapshot.video.adShowing));
    this.set("event", snapshot.lastEvent);
    this.set("changes", String(snapshot.video.videoChanges));
    this.set("seeks", String(snapshot.video.seeks));
    this.set("audio", snapshot.audio.status);
    this.set(
      "captured",
      snapshot.audio.status === "running"
        ? snapshot.audio.signalDetected
          ? "yes"
          : "awaiting signal"
        : "no",
    );
    this.set("method", snapshot.audio.method ?? "—");
    this.set("context", snapshot.audio.contextState ?? "—");
    this.set("tracks", String(snapshot.audio.audioTracks));
    this.set("rms", snapshot.audio.rms.toFixed(5));
    this.set("peakRms", snapshot.audio.peakRms.toFixed(5));
    this.set("speech", snapshot.audio.speechProbability.toFixed(2));
    this.set("frames", String(snapshot.detector.frames));
    this.set("speechActive", String(snapshot.detector.speechActive));
    this.set("vad", snapshot.detector.speechProbability.toFixed(2));
    this.set("noise", `${snapshot.detector.noiseFloorDb.toFixed(1)} dB`);
    this.set("syllables", String(snapshot.detector.syllablesDetected));
    this.set(
      "prominence",
      snapshot.detector.lastProminenceDb === undefined
        ? "—"
        : `${snapshot.detector.lastProminenceDb.toFixed(1)} dB`,
    );
    this.set(
      "sourceRate",
      snapshot.detector.measurement === undefined
        ? "—"
        : `${snapshot.detector.measurement.articulationRate.toFixed(2)} syl/s`,
    );
    this.set(
      "windowSyllables",
      snapshot.detector.measurement === undefined
        ? "—"
        : snapshot.detector.measurement.syllableCount.toFixed(1),
    );
    this.set(
      "activeSpeech",
      snapshot.detector.measurement === undefined
        ? "—"
        : `${snapshot.detector.measurement.activeSpeechDuration.toFixed(2)} s`,
    );
    this.set(
      "confidence",
      snapshot.detector.measurement === undefined
        ? "—"
        : snapshot.detector.measurement.confidence.toFixed(2),
    );
    this.set(
      "gate",
      snapshot.detector.accepted
        ? "accepted"
        : (snapshot.detector.rejectionReason ?? "rejected"),
    );
    this.set("controllerRunning", String(snapshot.controller.running));
    this.set("controllerState", snapshot.controller.state);
    this.set(
      "filteredRate",
      snapshot.controller.output?.filteredArticulationRate === undefined
        ? "—"
        : `${snapshot.controller.output.filteredArticulationRate.toFixed(2)} syl/s`,
    );
    this.set(
      "targetSpeed",
      snapshot.controller.output === undefined
        ? "—"
        : `${snapshot.controller.output.targetPlaybackRate.toFixed(2)}x`,
    );
    this.set(
      "commandedSpeed",
      snapshot.controller.output === undefined
        ? "—"
        : `${snapshot.controller.output.commandedPlaybackRate.toFixed(2)}x`,
    );
    this.set(
      "deliveredRate",
      snapshot.controller.output?.filteredArticulationRate === undefined
        ? "—"
        : `${(
            snapshot.controller.output.filteredArticulationRate *
            snapshot.video.playbackRate
          ).toFixed(2)} syl/s`,
    );
    this.set("error", snapshot.audio.error ?? "—");
    this.set("url", snapshot.video.url);

    this.startButton.hidden = !snapshot.enabled || snapshot.controller.running;
    this.startButton.disabled = !snapshot.video.found;
  }

  remove(): void {
    this.host.remove();
  }

  private set(key: string, value: string): void {
    const element = this.values.get(key);
    if (element !== undefined) {
      element.textContent = value;
      element.title = value;
    }
  }

}

const ROWS = [
  ["video", "Video found"],
  ["mediaTime", "Media time"],
  ["rate", "Playback rate"],
  ["paused", "Paused"],
  ["seeking", "Seeking"],
  ["ad", "Ad showing"],
  ["event", "Last lifecycle event"],
  ["changes", "Video changes"],
  ["seeks", "Seeks"],
  ["audio", "Audio status"],
  ["captured", "Audio captured"],
  ["method", "Capture method"],
  ["context", "AudioContext"],
  ["tracks", "Captured tracks"],
  ["rms", "RMS"],
  ["peakRms", "Peak RMS"],
  ["speech", "Energy proxy"],
  ["frames", "Analysis frames"],
  ["speechActive", "Speech active"],
  ["vad", "Speech probability"],
  ["noise", "Noise floor"],
  ["syllables", "Syllables total"],
  ["prominence", "Last prominence"],
  ["sourceRate", "Source articulation"],
  ["windowSyllables", "Syllables in window"],
  ["activeSpeech", "Active speech time"],
  ["confidence", "Detector confidence"],
  ["gate", "Confidence gate"],
  ["controllerRunning", "Controller running"],
  ["controllerState", "Controller state"],
  ["filteredRate", "Filtered source rate"],
  ["targetSpeed", "Target speed"],
  ["commandedSpeed", "Commanded speed"],
  ["deliveredRate", "Delivered articulation"],
  ["error", "Capture note/error"],
  ["url", "URL"],
] as const;
