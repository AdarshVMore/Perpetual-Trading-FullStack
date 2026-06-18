import jwt from "jsonwebtoken"
import type { Response, Request, NextFunction } from "express"

const userJWT_Secret = "user_secret"
const adminJWT_Secret = "admin_secret"

export async function authUserMiddleware(req:Request, res:Response,next:NextFunction){
    const tokenArray = req.headers.authorization

    if(!tokenArray){
        res.status(401).json({message: "token not found"})
        return
    }

    const token = tokenArray.split(' ')[1]

    if(!token){
        res.status(401).json({message: "token not found"})
        return
    }

    try{
        const verificationId = jwt.verify(token, userJWT_Secret)
        // if(verificationId === ) {

        // }
        next()


    }catch(err){
        console.log(err)
    }



}

export async function authAdminMiddleware(req:Request, res:Response,next:NextFunction){
    const tokenArray = req.headers.authorization

    if(!tokenArray){
        res.status(401).json({message: "token not found"})
        return
    }

    const token = tokenArray.split(' ')[1]

    if(!token){
        res.status(401).json({message: "token not found"})
        return
    }

    const verificationId = jwt.verify(token, adminJWT_Secret)


    next()

}