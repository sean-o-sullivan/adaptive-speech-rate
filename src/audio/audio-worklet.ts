declare const currentTime: number;
declare const sampleRate: number;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: readonly (readonly Float32Array[])[],
    outputs: readonly (readonly Float32Array[])[],
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor,
): void;

class SpeechAnalysisProcessor extends AudioWorkletProcessor {
  private sampleCount = 0;
  private sumSquares = 0;
  private peak = 0;
  private zeroCrossings = 0;
  private previousSample = 0;
  private hasPreviousSample = false;
  private readonly aggregationSamples = 256;
  private previousInput = 0;
  private previousHighPassed = 0;
  private previousBandPassed = 0;
  private readonly highPassAlpha = calculateHighPassAlpha(90);
  private readonly lowPassAlpha = calculateLowPassAlpha(4_500);

  override process(
    inputs: readonly (readonly Float32Array[])[],
    _outputs: readonly (readonly Float32Array[])[],
  ): boolean {
    const channels = inputs[0];
    const frameLength = channels?.[0]?.length ?? 0;
    if (channels === undefined || channels.length === 0 || frameLength === 0) {
      return true;
    }

    for (let index = 0; index < frameLength; index += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[index] ?? 0;
      sample /= channels.length;

      const highPassed =
        this.highPassAlpha *
        (this.previousHighPassed + sample - this.previousInput);
      const bandPassed =
        this.previousBandPassed +
        this.lowPassAlpha * (highPassed - this.previousBandPassed);
      this.previousInput = sample;
      this.previousHighPassed = highPassed;
      this.previousBandPassed = bandPassed;

      this.sumSquares += bandPassed * bandPassed;
      this.peak = Math.max(this.peak, Math.abs(bandPassed));
      if (
        this.hasPreviousSample &&
        ((bandPassed >= 0 && this.previousSample < 0) ||
          (bandPassed < 0 && this.previousSample >= 0))
      ) {
        this.zeroCrossings += 1;
      }
      this.previousSample = bandPassed;
      this.hasPreviousSample = true;
      this.sampleCount += 1;

      if (this.sampleCount >= this.aggregationSamples) {
        this.port.postMessage({
          type: "analysis-frame",
          contextTimeEnd: currentTime + (index + 1) / sampleRate,
          durationSeconds: this.sampleCount / sampleRate,
          rms: Math.sqrt(this.sumSquares / this.sampleCount),
          peak: this.peak,
          zeroCrossingRate: this.zeroCrossings / this.sampleCount,
        });
        this.sampleCount = 0;
        this.sumSquares = 0;
        this.peak = 0;
        this.zeroCrossings = 0;
      }
    }

    return true;
  }
}

registerProcessor("adaptive-speech-analysis", SpeechAnalysisProcessor);

function calculateHighPassAlpha(cutoffHz: number): number {
  const timeStep = 1 / sampleRate;
  const timeConstant = 1 / (2 * Math.PI * cutoffHz);
  return timeConstant / (timeConstant + timeStep);
}

function calculateLowPassAlpha(cutoffHz: number): number {
  const timeStep = 1 / sampleRate;
  const timeConstant = 1 / (2 * Math.PI * cutoffHz);
  return timeStep / (timeConstant + timeStep);
}
