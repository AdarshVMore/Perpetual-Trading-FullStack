import type {
  dbPollerEvent,
  dbPollerEvents,
  dbPollerPayload,
  User,
} from "@shared-types";
import { EngineServer } from "./classes/EngineServer";
import { OrderBook } from "./classes/OrderBook";
import { UserManager } from "./classes/UserManager";
import { RiskManager } from "./classes/RiskManager";
import { FillManager } from "./classes/FillManager";
import { PositionManager } from "./classes/PositionManager";
import { MatchingEngine } from "./classes/MatchingEngine";
import { RedisManager } from "./classes/RedisManager";
import { DBPoller } from "./classes/DBPollerManager";
import { LiquidationManager } from "./classes/LiquidationManager";

import db from "../../../packages/prisma-db";
const users = new Map<string, User>();
const userIds: string[] = [];


const redisManager = new RedisManager();

const orderBook = new OrderBook();
const userManager = new UserManager(users, userIds);
const riskManager = new RiskManager(userManager, orderBook);
const fillManager = new FillManager();
const positionManager = new PositionManager(userManager, redisManager);

const matchingEngine = new MatchingEngine(
  orderBook,
  fillManager,
  positionManager,
  riskManager,
);

const engineServer = new EngineServer(
  matchingEngine,
  userManager,
  riskManager,
  redisManager
);

const liquidationManager = new LiquidationManager(userManager, engineServer, redisManager)


await redisManager.connect();

const dbPoller = new DBPoller(redisManager.getPublisherClient());
matchingEngine.setDBPoller(dbPoller)
positionManager.setDBPoller(dbPoller)

await liquidationManager.init()
void engineServer.start().catch((error) => {
  console.error("engine server stopped unexpectedly", error);
});

console.log("all redis managers are getting called");
