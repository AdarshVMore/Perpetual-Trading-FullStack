import {
  BINANCE_CONTROL_CHANNEL,
  BINANCE_WANTED_KEY,
  createRedisConnection,
} from "@redis-client";
import type { RedisClientType } from "redis";
import WebSocket, { type RawData } from "ws";

const PUBLISH_INTERVAL_MS = Number(process.env.PUBLISH_INTERVAL_MS ?? 3000);
const POLL_WANTED_MS = Number(process.env.BINANCE_POLL_MS ?? 15_000);
const ALWAYS_ON = process.env.BINANCE_ALWAYS_ON === "1";
const BINANCE_URL =
  "wss://stream.binance.com:9443/ws/btcusdt@trade/ethusdt@trade/solusdt@trade";

interface LatestTrade {
  raw: string;
  price: string;
}

const latest = new Map<string, LatestTrade>();
const lastPublishedPrice = new Map<string, string>();

let binanceWs: WebSocket | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let active = false;

const redisClient = await createRedisConnection();
if (!redisClient) {
  throw new Error("binance-ws requires REDIS_URL");
}
const redis = redisClient;

function startStreaming() {
  if (active) return;
  active = true;

  console.log(
    `binance demand — connecting (publish every ${PUBLISH_INTERVAL_MS}ms)`,
  );

  binanceWs = new WebSocket(BINANCE_URL);

  binanceWs.on("open", () => {
    console.log("binance WS CONNECTED");
  });

  binanceWs.on("message", (data: RawData) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (!parsed?.s || parsed?.p == null) return;
      latest.set(parsed.s, {
        raw: JSON.stringify(parsed),
        price: String(parsed.p),
      });
    } catch {}
  });

  binanceWs.on("error", console.error);

  binanceWs.on("close", () => {
    console.log("binance WS closed");
    if (active) {
      active = false;
      if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
      }
      binanceWs = null;
    }
  });

  flushTimer = setInterval(() => {
    for (const [symbol, trade] of latest) {
      if (lastPublishedPrice.get(symbol) === trade.price) continue;
      lastPublishedPrice.set(symbol, trade.price);
      void redis.publish("binance-markprices", trade.raw);
    }
  }, PUBLISH_INTERVAL_MS);
}

function stopStreaming() {
  if (!active && !binanceWs && !flushTimer) return;
  active = false;

  console.log("binance idle — disconnecting (no frontend viewers)");

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (binanceWs) {
    binanceWs.removeAllListeners();
    binanceWs.close();
    binanceWs = null;
  }

  latest.clear();
  lastPublishedPrice.clear();
}

async function syncFromWantedKey() {
  try {
    const wanted = await redis.get(BINANCE_WANTED_KEY);
    if (wanted) startStreaming();
    else stopStreaming();
  } catch (err) {
    console.error("failed to read binance wanted key", err);
  }
}

if (ALWAYS_ON) {
  console.log("BINANCE_ALWAYS_ON=1 — streaming without demand gate");
  startStreaming();
} else {
  const controlSub = redis.duplicate() as RedisClientType;
  controlSub.on("error", (err: Error) => console.error(err));
  await controlSub.connect();

  await controlSub.subscribe(BINANCE_CONTROL_CHANNEL, (message: string) => {
    if (message === "start") startStreaming();
    else if (message === "stop") stopStreaming();
  });

  await syncFromWantedKey();
  setInterval(() => void syncFromWantedKey(), POLL_WANTED_MS);

  console.log(
    "binance-ws idle — waiting for WS clients (binance-control / binance:wanted)",
  );
}
