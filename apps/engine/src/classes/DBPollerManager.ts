import type { RedisClientType } from "redis";
import type { dbPollerEvents } from "@shared-types/src";

export class DBPoller {

    constructor(private publisherClient:RedisClientType){}

    async sendToDBPoller(payloadData:dbPollerEvents){
    if(!payloadData){
      return
    }
    if (!this.publisherClient) {
      throw new Error("Redis publisher client is not connected");
    }

    const res = await this.publisherClient.XADD("send-to-dbpoller", "*", {"data":JSON.stringify(payloadData)})
    console.log("send response to dbpoller stream...", res)
  }

}