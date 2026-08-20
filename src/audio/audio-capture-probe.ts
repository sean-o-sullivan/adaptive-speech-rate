import type { AudioAnalysisFrame, WorkletFrameMessage } from "./audio-frame.js";

export type CaptureMethod = "captureStream";

export interface AudioProbeSnapshot {
  readonly status: "idle" | "starting" | "running" | "error";
  readonly method: CaptureMethod | undefined;
  readonly contextState: AudioContextState | undefined;
  readonly audioTracks: number;
  readonly signalDetected: boolean;
  readonly peakRms: number;
  readonly rms: number;
  readonly speechProbability: number;
  readonly error: string | undefined;
}

interface CapturableVideo extends HTMLVideoElement {
  captureStream?: () => MediaStream;
}

export class AudioCaptureProbe {
  private context: AudioContext | undefined;
  private source: AudioNode | undefined;
  private analyser: AnalyserNode | undefined;
  private worklet: AudioWorkletNode | undefined;
  private silentGain: GainNode | undefined;
  private stream: MediaStream | undefined;
  private video: HTMLVideoElement | undefined;
  private samples: Float32Array<ArrayBuffer> | undefined;
  private currentStatus: AudioProbeSnapshot["status"] = "idle";
  private currentMethod: CaptureMethod | undefined;
  private currentError: string | undefined;
  private noiseFloorDb = -70;
  private peakRms = 0;

  constructor(
    private readonly onAnalysisFrame: (frame: AudioAnalysisFrame) => void =
      () => {},
  ) {}

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    this.currentStatus = "starting";
    this.currentError = undefined;

    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      this.context = context;
      await context.resume();

      const capturable = video as CapturableVideo;
      if (typeof capturable.captureStream !== "function") {
        throw new Error("HTMLMediaElement.captureStream is unavailable");
      }
      const stream = capturable.captureStream();
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("captureStream returned no audio track");
      }
      this.stream = stream;
      this.video = video;
      this.source = context.createMediaStreamSource(stream);
      this.currentMethod = "captureStream";

      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.35;
      this.source.connect(analyser);
      this.analyser = analyser;
      this.samples = new Float32Array(analyser.fftSize);

      await context.audioWorklet.addModule(
        chrome.runtime.getURL("audio/audio-worklet.js"),
      );
      const worklet = new AudioWorkletNode(
        context,
        "adaptive-speech-analysis",
      );
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      worklet.port.onmessage = (event: MessageEvent<unknown>) =>
        this.handleWorkletMessage(event.data);
      this.source.connect(worklet);
      worklet.connect(silentGain);
      silentGain.connect(context.destination);
      this.worklet = worklet;
      this.silentGain = silentGain;
      this.currentStatus = "running";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.stop();
      this.currentStatus = "error";
      this.currentError = message;
      throw error;
    }
  }

  stop(): void {
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.worklet !== undefined) this.worklet.port.onmessage = null;
    this.worklet?.disconnect();
    this.silentGain?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close();
    this.context = undefined;
    this.source = undefined;
    this.analyser = undefined;
    this.worklet = undefined;
    this.silentGain = undefined;
    this.stream = undefined;
    this.video = undefined;
    this.samples = undefined;
    this.currentMethod = undefined;
    this.currentStatus = "idle";
    this.currentError = undefined;
    this.noiseFloorDb = -70;
    this.peakRms = 0;
  }

  snapshot(): AudioProbeSnapshot {
    const rms = this.calculateRms();
    this.peakRms = Math.max(this.peakRms, rms);
    const levelDb = rms === 0 ? -120 : 20 * Math.log10(rms);
    const noiseAlpha = levelDb < this.noiseFloorDb ? 0.08 : 0.002;
    this.noiseFloorDb += noiseAlpha * (levelDb - this.noiseFloorDb);
    const speechProbability = clamp((levelDb - this.noiseFloorDb - 6) / 18, 0, 1);

    return {
      status: this.currentStatus,
      method: this.currentMethod,
      contextState: this.context?.state,
      audioTracks: this.stream?.getAudioTracks().length ?? 0,
      signalDetected: this.peakRms > 0.0001,
      peakRms: this.peakRms,
      rms,
      speechProbability,
      error: this.currentError,
    };
  }

  private calculateRms(): number {
    if (this.analyser === undefined || this.samples === undefined) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sumSquares = 0;
    for (const sample of this.samples) sumSquares += sample * sample;
    return Math.sqrt(sumSquares / this.samples.length);
  }

  private handleWorkletMessage(value: unknown): void {
    if (!isWorkletFrameMessage(value)) return;
    const context = this.context;
    const video = this.video;
    if (
      context === undefined ||
      video === undefined ||
      video.paused ||
      video.seeking
    ) {
      return;
    }

    const playbackRate = video.playbackRate;
    const deliveryDelaySeconds = Math.max(
      0,
      context.currentTime - value.contextTimeEnd,
    );
    const mediaTimeEnd = Math.max(
      0,
      video.currentTime - deliveryDelaySeconds * playbackRate,
    );
    const sourceDurationSeconds = value.durationSeconds * playbackRate;
    const mediaTimeStart = Math.max(0, mediaTimeEnd - sourceDurationSeconds);
    if (mediaTimeEnd <= mediaTimeStart) return;

    this.onAnalysisFrame({
      mediaTimeStart,
      mediaTimeEnd,
      sourceDurationSeconds: mediaTimeEnd - mediaTimeStart,
      rms: value.rms,
      peak: value.peak,
      zeroCrossingRate: value.zeroCrossingRate,
    });
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isWorkletFrameMessage(value: unknown): value is WorkletFrameMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<WorkletFrameMessage>;
  return (
    candidate.type === "analysis-frame" &&
    isFiniteNumber(candidate.contextTimeEnd) &&
    isFiniteNumber(candidate.durationSeconds) &&
    isFiniteNumber(candidate.rms) &&
    isFiniteNumber(candidate.peak) &&
    isFiniteNumber(candidate.zeroCrossingRate)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
