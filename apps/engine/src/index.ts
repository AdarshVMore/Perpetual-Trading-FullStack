import { Engine } from "./classes/engine";
import express from "express"
import {createRedisConnection} from "@redis-client"

const app = express()
app.use(express.json())

export async function redisInit(){
    console.log("starting redis on engine")
    const redisClient = await createRedisConnection()

    if(!redisClient){
        console.log("redis client in engine isnt working")
        return
    }
    console.log("waiting for response from stream.......")
    const data = await redisClient.xRange('new-name', '-', '+');
    console.log("data is" , data)

}

redisInit()

setInterval(redisInit, 2000)
