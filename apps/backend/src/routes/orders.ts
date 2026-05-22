// /create-order
// /cancle-order/:id
// /create-market
// /get-order/:id
// /get-fills/:marketId

import { Router } from "express";
import type { Response, Request } from "express";
import { authUserMiddleware, authAdminMiddleware } from "../middleware/auth";

const routes = Router()

routes.post("/create-order", authUserMiddleware, (req:Request, res:Response) => {

})
routes.post("/cancle-order",authUserMiddleware, (req:Request, res:Response) => {

})
routes.get("/get-order/:orderId", authAdminMiddleware, (req:Request, res:Response) => {

})