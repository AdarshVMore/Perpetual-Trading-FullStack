import { WebsocketManager } from "./webSocketManager";

import { WebSocketServer } from "ws";

const ws = new WebSocketServer()

const wsManager = new WebsocketManager(ws)