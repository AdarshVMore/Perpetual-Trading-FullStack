import { Engine } from "./classes/engine";
import express from "express"
import {createRedisConnection} from "../../../packages/lib/redis-client"

const app = express()
app.use(express.json())

export async function redisInit(){
    const redisClient = await createRedisConnection()
    
}



app.listen(3002, ()=>{
    console.log("engine is running on port 3002")
})