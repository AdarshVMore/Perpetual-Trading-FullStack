console.log("Hello via Bun!");
import { createRedisConnection } from "@redis-client";

const redisClient = await createRedisConnection();
let lastMessageId = "0";

while (true) {
  const data = await redisClient?.xRead(
    [
      {
        key: "send-to-dbpoller",
        id: lastMessageId,
      },
    ],
    {
      BLOCK: 0, // this means wait forever untill new message arrives
    },
  );

  if (data) {
    for (let stream of data) {
      for (let singleMessage of stream.messages) {
        lastMessageId = singleMessage.id;
        if (!singleMessage.message.data) {
          throw new Error("no data recieved");
        }
        const payload = JSON.parse(singleMessage.message.data);
        console.log("data from db poller stream", payload);
      }
    }
  }
}

// All Events to listen to

// OrderUpdate
// Trade Execution
// Position Update
// Fills created

// tables
//  V1 : Orders + Users => Orders , Fills

// Implement Consumer Groups

// Types of Events
// EventTypes: OrderEvent , TradeEvent , FillsEvent , PositionUpdateEvent
