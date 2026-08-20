export interface WorkletFrameMessage {
  readonly type: "analysis-frame";
  readonly contextTimeEnd: number;
  readonly durationSeconds: number;
  readonly rms: number;
  readonly peak: number;
  readonly zeroCrossingRate: number;
}

export interface AudioAnalysisFrame {
  readonly mediaTimeStart: number;
  readonly mediaTimeEnd: number;
  readonly sourceDurationSeconds: number;
  readonly rms: number;
  readonly peak: number;
  readonly zeroCrossingRate: number;
}
