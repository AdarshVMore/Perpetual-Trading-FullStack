import { WebsocketManager } from "./WebSocketManager";
import { SubcriptionManager } from "./SubscriptionManager";
import { initializePubSub } from "./RedisSubscriber";

import { createServer } from "http";
import { WebSocketServer } from "ws";

const WS_PORT = Number(process.env.PORT ?? 8080);

// A minimal HTTP server so hosts like Render can health-check on GET /health,
// while WebSocket upgrade requests are handed to the WebSocketServer below.
const httpServer = createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("perp-ws ok");
    return;
  }
  res.writeHead(426, { "Content-Type": "text/plain" });
  res.end("Upgrade Required");
});

const ws = new WebSocketServer({ server: httpServer });

const subscriptionManager = new SubcriptionManager();
const initializePubsub = new initializePubSub(subscriptionManager);

await initializePubsub.init();

new WebsocketManager(ws, subscriptionManager, initializePubsub);

httpServer.listen(WS_PORT, "0.0.0.0", () => {
  console.log(`started websocket connection at ${WS_PORT}`);
});
