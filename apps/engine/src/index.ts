import type { User } from "@shared-types";
import { EngineServer } from "./classes/EngineServer";
import { OrderBook } from "./classes/OrderBook";
import { UserManager } from "./classes/UserManager";
import { RiskManager } from "./classes/RiskManager";
import { FillManager } from "./classes/FillManager";
import { PositionManager } from "./classes/PositionManager";
import { MatchingEngine } from "./classes/MatchingEngine";
import { RedisManager } from "./classes/RedisManager";

const users = new Map<string, User>();
const userIds:string[] = []

const orderBook = new OrderBook();
const userManager = new UserManager(users, userIds);
const riskManager = new RiskManager(userManager, orderBook);
const fillManager = new FillManager();
const positionManager = new PositionManager(riskManager, userManager);
const matchingEngine = new MatchingEngine(orderBook, fillManager, positionManager, riskManager);
const engineServer = new EngineServer(
  orderBook,
  matchingEngine,
  userManager,
  positionManager,
  riskManager,
  fillManager,
);

const redisManager = new RedisManager(engineServer);

await redisManager.connect();
redisManager.listen().catch((error) => {
  console.error("Redis stream listener failed", error);
});
redisManager.publish();
console.log("all redis managers are getting called");
