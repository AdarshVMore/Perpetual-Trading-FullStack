import { redis } from "bun";
import WebSocket, { type RawData } from "ws";

const ws = new WebSocket(
  "wss://stream.binance.com:9443/ws/btcusdt@trade/ethusdt@trade/solusdt@trade"
);

ws.on("open", () => {
  console.log("CONNECTED");
});

ws.on("message", (data:any) => {
  const parsed = JSON.parse(data.toString())
  redis.publish("binance-markprices", JSON.stringify(parsed))
  redis.set(`mark:${parsed.s}`, parsed.p)
});

ws.on("error", console.error);