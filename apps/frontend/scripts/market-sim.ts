#!/usr/bin/env bun
/**
 * Headless market simulator — run alongside the stack for live depth/trades.
 *
 *   bun run market-sim
 *   bun run market-sim -- --bots 12 --interval 500
 */
import {
  DEFAULT_SIMULATOR_CONFIG,
  MarketSimulator,
  type MarketSimulatorConfig,
} from "../src/lib/simulation/marketSimulator";
import { resolveReferencePrice } from "../src/lib/constants";
import type { TradableSymbol } from "../src/lib/types";

function parseArgs(): Partial<MarketSimulatorConfig> {
  const args = process.argv.slice(2);
  const patch: Partial<MarketSimulatorConfig> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--bots" && args[i + 1]) patch.botCount = Number(args[++i]);
    if (a === "--interval" && args[i + 1]) {
      const ms = Number(args[++i]);
      patch.intervalMs = [ms, ms * 2];
    }
    if (a === "--cancel" && args[i + 1])
      patch.cancelProbability = Number(args[++i]);
    if (a === "--spread" && args[i + 1])
      patch.spreadPct = Number(args[++i]);
  }
  return patch;
}

const config: MarketSimulatorConfig = {
  ...DEFAULT_SIMULATOR_CONFIG,
  ...parseArgs(),
};

const sim = new MarketSimulator();

console.log("Market simulator CLI");
console.log(
  `API: ${process.env.VITE_API_URL ?? "http://localhost:3000/api/v1"}`,
);
console.log(
  `Bots: ${config.botCount} | Markets: ${config.markets.join(", ")} | ` +
    `Interval: ${config.intervalMs[0]}–${config.intervalMs[1]}ms`,
);
console.log("Press Ctrl+C to stop.\n");

process.on("SIGINT", () => {
  console.log("\nStopping…");
  sim.stop();
});

void sim.start(
  config,
  (symbol: TradableSymbol) => resolveReferencePrice(symbol),
  (line) => console.log(line),
);
