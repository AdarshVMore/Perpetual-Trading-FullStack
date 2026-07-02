import { createRedisConnection } from "@redis-client";
import { AppendData } from "./AppendData";

const CHECKPOINT_KEY = "dbpoller:last-stream-id";

const redisClient = await createRedisConnection();
if (!redisClient) {
  throw new Error("db-poller failed to connect to redis");
}

// Resume from the last processed id so a restart does not reprocess the whole
// stream from the beginning. On first run (no checkpoint) start at "$" so we
// only consume new events instead of grinding through a large historical
// backlog, which would keep the poller permanently behind real time.
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
        // A single malformed/duplicate message must not wedge the pipeline
        // forever. Log it and advance the cursor so later events still persist.
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
