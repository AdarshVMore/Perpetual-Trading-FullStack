import { createRedisConnection } from "@redis-client";
import { LinkList, OrderedMap } from "js-sdsl";
import type { User, OrderBooks, Fills } from "@shared-types";
import { EngineServer } from "./classes/EngineServer";

const orderedMap = new OrderedMap();
const linkedList = new LinkList();

const users: User[] = [];
export const orderBook: OrderBooks[] = [];
const fills: Fills[] = [];

let data;

export async function redisInit() {
  console.log("starting redis on engine");
  const redisClient = await createRedisConnection();

  if (!redisClient) {
    console.log("redis client in engine isnt working");
    return;
  }
  console.log("waiting for response from stream.......");
  data = await redisClient.xRange("send-to-engine", "-", "+");
  console.log("data is", data);
  for(let singleData of data){
    const engineServer = new EngineServer()
    if(singleData.message.type === "create-order") {
        engineServer.createOrder(singleData)
    }
  }
  
}

redisInit();

setInterval(redisInit, 2000);