import { redis } from "bun";
import WebSocket, { type RawData } from "ws";

const PUBLISH_INTERVAL_MS = Number(process.env.PUBLISH_INTERVAL_MS ?? 3000);

const ws = new WebSocket(
  "wss://stream.binance.com:9443/ws/btcusdt@trade/ethusdt@trade/solusdt@trade",
);

interface LatestTrade {
  raw: string;
  price: string;
}

const latest = new Map<string, LatestTrade>();
const lastPublishedPrice = new Map<string, string>();

ws.on("open", () => {
  console.log(
    `binance WS CONNECTED — publishing every ${PUBLISH_INTERVAL_MS}ms`,
  );
});

ws.on("message", (data: RawData) => {
  try {
    const parsed = JSON.parse(data.toString());
    if (!parsed?.s || parsed?.p == null) return;
    latest.set(parsed.s, { raw: JSON.stringify(parsed), price: String(parsed.p) });
  } catch {
   
  }
});

ws.on("error", console.error);

const flushTimer = setInterval(() => {
  for (const [symbol, trade] of latest) {
    if (lastPublishedPrice.get(symbol) === trade.price) continue;
    lastPublishedPrice.set(symbol, trade.price);
    void redis.publish("binance-markprices", trade.raw);
  }
}, PUBLISH_INTERVAL_MS);

ws.on("close", () => {
  clearInterval(flushTimer);
  console.log("binance WS closed");
});
