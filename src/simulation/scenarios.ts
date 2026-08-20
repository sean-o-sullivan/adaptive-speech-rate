import type { SimulationScenario } from "./controller-simulator.js";

export const DEFAULT_SCENARIOS: readonly SimulationScenario[] = [
  {
    name: "constant slow speaker",
    segments: [
      { label: "slow speech", durationSeconds: 30, articulationRate: 3 },
    ],
  },
  {
    name: "constant fast speaker",
    segments: [
      { label: "fast speech", durationSeconds: 30, articulationRate: 7 },
    ],
  },
  {
    name: "sudden increase",
    segments: [
      { label: "slow speech", durationSeconds: 20, articulationRate: 3 },
      { label: "fast speech", durationSeconds: 20, articulationRate: 7 },
    ],
  },
  {
    name: "sudden decrease",
    segments: [
      { label: "fast speech", durationSeconds: 20, articulationRate: 7 },
      { label: "slow speech", durationSeconds: 20, articulationRate: 3 },
    ],
  },
  {
    name: "pause",
    segments: [
      { label: "speech before pause", durationSeconds: 12, articulationRate: 4 },
      { label: "pause", durationSeconds: 5 },
      { label: "speech after pause", durationSeconds: 12, articulationRate: 4 },
    ],
  },
  {
    name: "detector dropout",
    segments: [
      { label: "detected speech", durationSeconds: 12, articulationRate: 4 },
      {
        label: "detector dropout",
        durationSeconds: 5,
        articulationRate: 4,
        detectionMode: "dropout",
      },
      { label: "detected speech resumes", durationSeconds: 12, articulationRate: 4 },
    ],
  },
  {
    name: "false detection burst",
    segments: [
      { label: "ordinary speech", durationSeconds: 25, articulationRate: 4 },
    ],
    falseDetectionBursts: [
      { mediaTime: 12, candidateCount: 60, durationSeconds: 0.1 },
    ],
  },
  {
    name: "seek",
    segments: [
      { label: "speech", durationSeconds: 180, articulationRate: 4 },
    ],
    seeks: [{ wallTime: 5, destinationMediaTime: 120 }],
  },
];
