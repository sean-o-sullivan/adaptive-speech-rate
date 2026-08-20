import { DEFAULT_SCENARIOS } from "../../src/simulation/scenarios.js";
import { simulateScenario } from "../../src/simulation/controller-simulator.js";

for (const scenario of DEFAULT_SCENARIOS) {
  const result = simulateScenario(scenario);
  const last = result.trace.at(-1);
  if (last === undefined) throw new Error(`empty trace for ${scenario.name}`);

  const rates = result.trace.map(
    (point) => point.controller.commandedPlaybackRate,
  );
  const minimumRate = Math.min(...rates);
  const maximumRate = Math.max(...rates);

  console.log(
    [
      scenario.name.padEnd(22),
      `wall=${result.wallDuration.toFixed(1)}s`,
      `final=${last.controller.commandedPlaybackRate.toFixed(2)}x`,
      `target=${last.controller.targetPlaybackRate.toFixed(2)}x`,
      `range=${minimumRate.toFixed(2)}–${maximumRate.toFixed(2)}x`,
      `state=${last.controller.state}`,
    ].join("  "),
  );
}
