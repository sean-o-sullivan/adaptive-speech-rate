import type { FilterConfig } from "../config.js";

export class RobustRateFilter {
  private readonly history: number[] = [];
  private filteredValue: number | undefined;

  constructor(private readonly config: FilterConfig) {}

  update(rawRate: number): number {
    if (!Number.isFinite(rawRate) || rawRate <= 0) {
      throw new RangeError("rawRate must be finite and positive");
    }

    this.history.push(rawRate);
    while (this.history.length > this.config.medianHistoryLength) {
      this.history.shift();
    }

    const median = calculateMedian(this.history);
    this.filteredValue =
      this.filteredValue === undefined
        ? median
        : this.config.emaAlpha * median +
          (1 - this.config.emaAlpha) * this.filteredValue;

    return this.filteredValue;
  }

  value(): number | undefined {
    return this.filteredValue;
  }

  reset(): void {
    this.history.length = 0;
    this.filteredValue = undefined;
  }
}

function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("cannot calculate median of empty values");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const value = sorted[middle];
    if (value === undefined) throw new Error("median index missing");
    return value;
  }

  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) {
    throw new Error("median indices missing");
  }
  return (lower + upper) / 2;
}
