export interface RateLimit {
  readonly maximumAccelerationPerWallSecond: number;
  readonly maximumDecelerationPerWallSecond: number;
}

export function limitPlaybackRate(
  currentRate: number,
  targetRate: number,
  elapsedWallSeconds: number,
  limit: RateLimit,
): number {
  if (
    !Number.isFinite(currentRate) ||
    !Number.isFinite(targetRate) ||
    !Number.isFinite(elapsedWallSeconds)
  ) {
    throw new RangeError("rate-limiter inputs must be finite");
  }
  if (currentRate <= 0 || targetRate <= 0 || elapsedWallSeconds < 0) {
    throw new RangeError("rates must be positive and elapsed time non-negative");
  }

  if (targetRate >= currentRate) {
    return Math.min(
      targetRate,
      currentRate + limit.maximumAccelerationPerWallSecond * elapsedWallSeconds,
    );
  }

  return Math.max(
    targetRate,
    currentRate - limit.maximumDecelerationPerWallSecond * elapsedWallSeconds,
  );
}
