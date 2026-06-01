import { WebsocketManager } from "./WebSocketManager";
import { SubcriptionManager } from "./SubscriptionManager";
import { initializePubSub } from "./RedisSubscriber";

import { WebSocketServer } from "ws";

const ws = new WebSocketServer({port: 8080})

const subscriptionManager = new SubcriptionManager()
const initializePubsub = new initializePubSub(subscriptionManager)

initializePubsub.init()

new WebsocketManager(ws, subscriptionManager)

console.log("started wbsocket connection at 8080")