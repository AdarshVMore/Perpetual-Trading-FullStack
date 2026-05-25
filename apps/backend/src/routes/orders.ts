import { Router } from "express";
import type { Response, Request } from "express";
import { authUserMiddleware, authAdminMiddleware } from "../middleware/auth";
import {createRedisConnection} from "@redis-client"
import type { RedisClientType } from "redis";
import db from "@prisma-db"
import CreateOrderSchema from "@types"

const routes = Router()

let redisClient:RedisClientType | null

export async function connectRedisBackend(){
    redisClient = await createRedisConnection()
    console.log("connected backend with redis")
    return redisClient
}

connectRedisBackend()
routes.post("/create-order", async (req:Request, res:Response) => {
    const {userId, price, qty, marketId, orderType, positionType, leverage } = CreateOrderSchema.parse(req.body) 
    console.log(userId, price, qty, marketId, orderType, positionType, leverage)
    if(!redisClient){
        console.log("")
        res.status(400).json({message: "unable to start redis"})
        return
    }
    console.log("backend redis connected")
    const res1 = await redisClient.XADD("new-name", "*", {'price': price, 'qty': qty, 'orderType': orderType})
    
    console.log("added to new-name... ",res1)
    res.status(200).json({message: `recieved ${res1}`})
})
routes.post("/cancle-order/:orderId",authUserMiddleware, (req:Request, res:Response) => {
    const orderId = req.params.orderId
})
routes.post("/create-market",authAdminMiddleware, (req:Request, res:Response) => {
    const {marketName, maxLeverage} = req.body
})
routes.get("/get-order/:orderId", authUserMiddleware, (req:Request, res:Response) => {
    const orderId = req.params.orderId
})
routes.get("/get-fills/:marketId", authUserMiddleware, (req:Request, res:Response) => {
    const marketId = req.params.marketId
})

export default routes