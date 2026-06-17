import type { MatchingEngine } from "./MatchingEngine";
import type { RedisManager } from "./RedisManager";
import type { RiskManager } from "./RiskManager";
import type { UserManager } from "./UserManager";

export class EngineServer {
  constructor(
    private matchingEngine: MatchingEngine,
    private userManager: UserManager,
    private riskManager: RiskManager,
    private redisManager: RedisManager,
  ) {}

  async start(){
     while (true) {
      const message = await this.redisManager.readFromBackendServer();
      if (message) {
        for (let stream of message) {
          for (let singleMessage of stream.messages) {
            const payload = singleMessage.message;
            this.createOrder(payload);
          }
        }
      }
    }
  }

  public createOrder(data:any) {
    console.log("data recieved in the engine server", data)
    let user = this.userManager.getUser(data.userId)

    if(!user){
      console.log("adding new user")
      this.userManager.addUser(data.userId)
      user = this.userManager.getUser(data.userId)
    }

    const margin = this.riskManager.calculateMargin(data);
    
    const valid = this.riskManager.validate(data.userId, margin);

    if(!user) {
      throw new Error("user not found")
    }
        
    if(valid) {
      this.userManager.lockBalance(user, margin)
      this.userManager.addOrder(data.userId, data)
    }

    const response = this.matchingEngine.matchOrder(data)
  }

  public cancleOrder(orderId: string) {}
}
