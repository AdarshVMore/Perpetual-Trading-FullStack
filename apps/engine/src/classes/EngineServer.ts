import type { CreateMarket, Order, dbPollerEvents, marketType, orderStatus, positionType } from "@shared-types/src";
import type { orderUpdates } from "@shared-types/src/ws/ws.types";
import type { MatchingEngine } from "./MatchingEngine";
import type { RedisManager } from "./RedisManager";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";
import type { OrderBook } from "./OrderBook";
import { DBPoller } from "./DBPollerManager";

export class EngineServer {
  private dbpoller?: DBPoller;

  constructor(
    private matchingEngine: MatchingEngine,
    private userManager: UserManager,
    private riskManager: RiskManager,
    private redisManager: RedisManager,
    private orderBook: OrderBook
  ) {}

  setDBPoller(dbpoller: DBPoller) {
    this.dbpoller = dbpoller;
  }

  async start(){
     while (true) {
      const message = await this.redisManager.readFromBackendServer();
      if (message) {
        for (let stream of message) {
          for (let singleMessage of stream.messages) {
            const msg = singleMessage.message;
            if (msg.type === "create-order") {
              const order: Order = {
                orderId: msg.orderId ?? "",
                userId: msg.userId ?? "",
                marketId: msg.marketId ?? "",
                marketType: (msg.orderType ?? "LIMIT") as marketType,
                orderType: msg.orderType ?? "",
                positionType: (msg.positionType ?? "LONG") as positionType,
                status: (msg.status ?? "OPEN") as orderStatus,
                price: msg.price ? parseFloat(msg.price) : undefined,
                qty: msg.qty ? parseFloat(msg.qty) : 0,
                leverage: msg.leverage ? parseFloat(msg.leverage) : 1,
                remainingQty: msg.remainingQty ? parseFloat(msg.remainingQty) : 0,
              };
              await this.createOrder(order);
            }
            else if(msg.type === "cancle-order") {
              const order: Order = {
                orderId: msg.orderId ?? "",
                userId: msg.userId ?? "",
                marketId: msg.marketId ?? "",
                marketType: "LIMIT",
                orderType: msg.orderType ?? "",
                positionType: (msg.positionType ?? "LONG") as positionType,
                status: "OPEN",
                price: msg.price ? parseFloat(msg.price) : undefined,
                qty: msg.qty ? parseFloat(msg.qty) : 0,
                leverage: msg.leverage ? parseFloat(msg.leverage) : 1,
                remainingQty: msg.remainingQty ? parseFloat(msg.remainingQty) : 0,
              };
              this.cancleOrder(order)
            } else if(msg.type === "create-market"){
              const createMarket: CreateMarket = {
                marketName: msg.marketName ?? "",
                marketId: msg.marketId ?? "",
                maxLeverage: msg.maxLeverage ?? "10",
                symbol: msg.symbol ?? "",
              };
              this.createMarket(createMarket)
            } else if (msg.type === "add-balance") {
              await this.addBalance(msg.userId ?? "", parseFloat(msg.amount ?? "0"));
            }
            await this.redisManager.saveStreamId(singleMessage.id);
          }
        }
      }
    }
  }

  public async createOrder(data: Order) {
    let user = this.userManager.getUser(data.userId)

    if(!user){
      await this.userManager.addUser(data.userId)
      user = this.userManager.getUser(data.userId)
    }

    const margin = this.riskManager.calculateMargin(data);
    const valid = this.riskManager.validate(data.userId, margin);

    if(!user) {
      throw new Error("user not found")
    }

    if(!valid) {
      console.log(`[EngineServer] insufficient margin for user ${data.userId}, order rejected`);
      return;
    }

    this.userManager.lockBalance(user, margin)
    this.userManager.addOrder(data.userId, data)
    this.matchingEngine.matchOrder(data)

    if (data.marketType === "MARKET" && data.remainingQty > 0) {
      const unlockMargin = this.riskManager.calculateMarginForQty(data, data.remainingQty);
      this.userManager.unlockBalance(user, unlockMargin);
    }
  }

  public createLiquidationOrder(data: Order) {
    this.matchingEngine.matchOrder(data)
  }

  public cancleOrder(data: Order) {
    const user = this.userManager.getUser(data.userId);
    if (!user) return;

    const existingOrder = user.orders.find((o) => o.orderId === data.orderId);
    if (existingOrder) {
      data.qty = existingOrder.qty ?? data.qty;
      data.remainingQty = existingOrder.remainingQty ?? data.remainingQty ?? data.qty;
      data.price = existingOrder.price ?? data.price;
      data.leverage = existingOrder.leverage ?? data.leverage;
    }

    this.orderBook.cancleOrder(data)

    const unlockMargin = this.riskManager.calculateMarginForQty(data, data.remainingQty, data.price);
    this.userManager.unlockBalance(user, unlockMargin);
    this.userManager.removeOrder(data.userId, data.orderId);

    data.status = "CANCLE";

    if (this.dbpoller && data.orderId) {
      const cancelEvent: dbPollerEvents = {
        type: "OrderUpdate",
        payload: {
          method: "PUT",
          data: { ...data, status: "CANCLE" },
        },
      };
      void this.dbpoller.sendToDBPoller(cancelEvent);
    }

    const orderUpdateEvent: orderUpdates = {
      type: "orderUpdate",
      orderId: data.orderId,
      userId: data.userId,
      marketId: data.marketId,
      positionType: data.positionType,
      price: data.price,
      qty: data.qty,
      remainingQty: 0,
      leverage: data.leverage,
      status: "CANCLE",
    };
    const orderChannel = this.redisManager.createChannel("order", data.marketId, data.userId);
    void this.redisManager.publish(orderChannel, orderUpdateEvent);
  }

  public createMarket(data: CreateMarket) {
    this.orderBook.addMarket(data.marketId);

    if (this.dbpoller) {
      const marketEvent: dbPollerEvents = {
        type: "MarketCreated",
        payload: { method: "POST", data },
      };
      void this.dbpoller.sendToDBPoller(marketEvent);
    }
  }

  public async addBalance(userId: string, amount: number) {
    if (!amount || amount <= 0) return;

    let user = this.userManager.getUser(userId);
    if (!user) {
      await this.userManager.addUser(userId);
      return;
    }

    this.userManager.addBalance(user, amount);
  }
}
