import { Router } from "express";
import type { Response, Request } from "express";
import { authUserMiddleware, authAdminMiddleware } from "../middleware/auth";
import {createRedisConnection} from "@redis-client"
import type { RedisClientType } from "redis";
import db from "@prisma-db"
import {CreateOrderSchema, getFillsSchema, getOrderSchema, cancleOrdersSchema, createMarketSchema} from "@shared-types"

const routes = Router()

let redisClient:RedisClientType | null

export async function connectRedisBackend(){
    redisClient = await createRedisConnection()
    console.log("connected backend with redis")
    return redisClient
}

const redisStreamName = process.env.REDIS_STREAM_NAME


console.log('name of the stream', redisStreamName)

connectRedisBackend()
routes.post("/create-order", async (req:Request, res:Response) => {
    const result = CreateOrderSchema.safeParse(req.body)
    if(!result.success){
        return res.status(400).json({
            error: result.error.flatten()
        })
    }

    const {userId, price, qty, marketId, orderType, positionType, leverage } = result.data

    console.log(userId, price, qty, marketId, orderType, positionType, leverage)
    
    if(!redisClient){
        console.log("")
        res.status(400).json({message: "unable to start redis"})
        return
    }
    
    console.log("backend redis connected")
    
    let res1
    let reqId = Math.random()
    const requests = []

    if(orderType === "MARKET"){
        res1 = await redisClient.XADD("send-to-engine", "*", {reqId: req.toString(), 'type':'create-order', 'userId': userId ,'qty': qty.toString(),'marketId':marketId, 'orderType': orderType, 'positionType': positionType, 'leverage': leverage.toString()}) // redis only accepts buffer | string , so cant pass numbers in redis . so added .toString() numbers
        requests.push({reqId: reqId.toString(), 'type':'create-order', 'userId': userId ,'qty': qty.toString(),'marketId':marketId, 'orderType': orderType, 'positionType': positionType, 'leverage': leverage.toString()})
    } else if(orderType === "LIMIT"){
        res1 = await redisClient.XADD("send-to-engine", "*", {reqId: req.toString(), 'type':'create-order', 'userId': userId, 'price':price.toString() ,'qty': qty.toString(), 'marketId':marketId, 'orderType': orderType, 'positionType': positionType, 'leverage': leverage.toString()})
        requests.push({reqId: reqId.toString(), 'type':'create-order', 'userId': userId, 'price':price.toString() ,'qty': qty.toString(), 'marketId':marketId, 'orderType': orderType, 'positionType': positionType, 'leverage': leverage.toString()})
    }
    
    console.log("added to send-to-engine... ",res1)
    res.status(200).json({message: `order Accepted here is you queue number ${res1}`})
})
routes.post("/cancle-order/:orderId",authUserMiddleware, (req:Request, res:Response) => {
    const result = cancleOrdersSchema.safeParse(req.params)
     if(!result.success){
        return res.status(400).json({
            error: result.error.flatten()
        })
    }
    const {orderId} = result.data

})
routes.post("/create-market",authAdminMiddleware, async (req:Request, res:Response) => {
    const result = createMarketSchema.safeParse(req.body)
    if(!result.success){
        return res.status(400).json({
            error: result.error.flatten()
        })
    }
    const {marketName, marketId, maxLeverage} = result.data
    const res1 = await redisClient?.xAdd('send-to-engine', '*', {'type':'create-market', 'marketName':marketName, 'marketId':marketId, 'maxLeverage':maxLeverage.toString()})
    console.log("added to send-to-engine... ",res1)
    res.status(200).json({message: `recieved ${res1}`})
})
routes.get("/get-order/:orderId", authUserMiddleware, (req:Request, res:Response) => {
    const orderId = req.params.orderId
})
routes.get("/get-fills/:marketId", authUserMiddleware, (req:Request, res:Response) => {
    const marketId = req.params.marketId
})

export default routes