import { Engine } from "./classes/engine";
import express from "express"
import {createRedisConnection} from "@redis-client"
import {LinkList, OrderedMap} from "js-sdsl"

const orderedMap = new OrderedMap()
const linkedList = new LinkList()

const Users = []
const Orders = []
const Fills = []

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

// User      = userid => Balance => Position max 1 position for 1 Market => Orders => 
// OrderBook = MarketSymbol :  {
//                              Asks: orderedMap -> linkedList of orders, 
//                              Bids: orderedMap -> linkedList of orders, 
//                              lastTradedPrice (price on which last trade in orderbook happened)
//                              indexPrice (live Price of the market)
//                              }
// Fills     = []
// Engine Class => 
// OrderedMap + LinkedList => library