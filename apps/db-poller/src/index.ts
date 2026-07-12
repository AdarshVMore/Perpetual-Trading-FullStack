import { createRedisConnection } from "@redis-client";
import { AppendData } from "./AppendData";

const CHECKPOINT_KEY = "dbpoller:last-stream-id";

const redisClient = await createRedisConnection();
if (!redisClient) {
  throw new Error("db-poller failed to connect to redis");
}

const stored = await redisClient.get(CHECKPOINT_KEY);
let lastMessageId = stored ?? "$";

while (true) {
  const data = await redisClient.xRead(
    [
      {
        key: "send-to-dbpoller",
        id: lastMessageId,
      },
    ],
    {
      BLOCK: 0,
      COUNT: 100,
    },
  );

  if (!data) {
    continue;
  }

  for (const stream of data) {
    for (const singleMessage of stream.messages) {
      lastMessageId = singleMessage.id;

      try {
        if (!singleMessage.message.data) {
          throw new Error("no data received");
        }
        const payload = JSON.parse(singleMessage.message.data);
        const appendData = new AppendData(payload);
        await appendData.manipulateDB();
      } catch (err) {
        console.error(
          "db-poller failed to process message",
          singleMessage.id,
          err,
        );
      }

      await redisClient.set(CHECKPOINT_KEY, lastMessageId);
    }
  }
}
