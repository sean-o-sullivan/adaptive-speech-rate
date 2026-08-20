export type VideoLifecycleEventKind =
  | "video-changed"
  | "navigation"
  | "seeking"
  | "seeked"
  | "paused"
  | "playing"
  | "rate-changed";

export interface VideoLifecycleEvent {
  readonly kind: VideoLifecycleEventKind;
  readonly video: HTMLVideoElement | undefined;
}

export interface VideoSnapshot {
  readonly found: boolean;
  readonly mediaTime: number;
  readonly playbackRate: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  readonly adShowing: boolean;
  readonly url: string;
  readonly videoChanges: number;
  readonly seeks: number;
}

export class VideoLifecycle {
  private activeVideo: HTMLVideoElement | undefined;
  private observer: MutationObserver | undefined;
  private scanTimer: number | undefined;
  private currentUrl = location.href;
  private videoChangeCount = 0;
  private seekCount = 0;

  constructor(
    private readonly onEvent: (event: VideoLifecycleEvent) => void,
  ) {}

  start(): void {
    this.scan();
    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener("yt-navigate-finish", this.handleNavigation);
    window.addEventListener("popstate", this.handleNavigation);
    this.scanTimer = window.setInterval(() => this.scan(), 500);
  }

  stop(): void {
    this.detachVideo();
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.scanTimer !== undefined) window.clearInterval(this.scanTimer);
    this.scanTimer = undefined;
    document.removeEventListener("yt-navigate-finish", this.handleNavigation);
    window.removeEventListener("popstate", this.handleNavigation);
  }

  video(): HTMLVideoElement | undefined {
    return this.activeVideo;
  }

  snapshot(): VideoSnapshot {
    return {
      found: this.activeVideo !== undefined,
      mediaTime: this.activeVideo?.currentTime ?? 0,
      playbackRate: this.activeVideo?.playbackRate ?? 1,
      paused: this.activeVideo?.paused ?? true,
      seeking: this.activeVideo?.seeking ?? false,
      adShowing: document.querySelector(".html5-video-player.ad-showing") !== null,
      url: location.href,
      videoChanges: this.videoChangeCount,
      seeks: this.seekCount,
    };
  }

  private readonly handleNavigation = (): void => {
    if (this.currentUrl !== location.href) {
      this.currentUrl = location.href;
      this.onEvent({ kind: "navigation", video: this.activeVideo });
    }
    this.scan();
  };

  private readonly handleSeeking = (): void => {
    this.seekCount += 1;
    this.onEvent({ kind: "seeking", video: this.activeVideo });
  };

  private readonly handleSeeked = (): void => {
    this.onEvent({ kind: "seeked", video: this.activeVideo });
  };

  private readonly handlePause = (): void => {
    this.onEvent({ kind: "paused", video: this.activeVideo });
  };

  private readonly handlePlay = (): void => {
    this.onEvent({ kind: "playing", video: this.activeVideo });
  };

  private readonly handleRateChange = (): void => {
    this.onEvent({ kind: "rate-changed", video: this.activeVideo });
  };

  private scan(): void {
    if (this.currentUrl !== location.href) this.handleNavigation();
    const candidate =
      document.querySelector<HTMLVideoElement>("video.html5-main-video") ??
      document.querySelector<HTMLVideoElement>("video");
    if (candidate === this.activeVideo) return;

    this.detachVideo();
    this.activeVideo = candidate ?? undefined;
    if (this.activeVideo !== undefined) this.attachVideo(this.activeVideo);
    this.videoChangeCount += 1;
    this.onEvent({ kind: "video-changed", video: this.activeVideo });
  }

  private attachVideo(video: HTMLVideoElement): void {
    video.addEventListener("seeking", this.handleSeeking);
    video.addEventListener("seeked", this.handleSeeked);
    video.addEventListener("pause", this.handlePause);
    video.addEventListener("play", this.handlePlay);
    video.addEventListener("ratechange", this.handleRateChange);
  }

  private detachVideo(): void {
    if (this.activeVideo === undefined) return;
    this.activeVideo.removeEventListener("seeking", this.handleSeeking);
    this.activeVideo.removeEventListener("seeked", this.handleSeeked);
    this.activeVideo.removeEventListener("pause", this.handlePause);
    this.activeVideo.removeEventListener("play", this.handlePlay);
    this.activeVideo.removeEventListener("ratechange", this.handleRateChange);
    this.activeVideo = undefined;
  }
}
