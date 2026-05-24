console.log("Hello via Bun!");

import { redis } from "bun";
// data structure
// redis streams implement
// get inputs from redis streams => switch case for operation type
// 
// 
// 
// 
// 
// 
// 
// 
// 
// 


import { createRedisConnection } from "@redis-client";

export async function retrievingData(){
    const redisClient = await createRedisConnection()
    if(!redisClient){
        console.log("redis connection failed in engine")
        return
    }
    const data = await redisClient.xRange('new-name', '-', '+');
}

retrievingData()