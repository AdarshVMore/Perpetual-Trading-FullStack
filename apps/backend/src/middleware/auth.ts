import jwt from "jsonwebtoken"
import type { Response, Request, NextFunction } from "express"
import db from "@prisma-db"

const userJWT_Secret = process.env.USER_JWT_SECRET ?? "user_secret"
const adminJWT_Secret = process.env.ADMIN_JWT_SECRET ?? "admin_secret"

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
        const verificationId = jwt.verify(token, userJWT_Secret) as {
            userId: string
        }
        req.userId = verificationId.userId
        next()

    }catch(err){
        res.status(401).json({message: "invalid token"})
        return
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

    try {
        const verificationId = jwt.verify(token, adminJWT_Secret) as {
            userId: string
        }
        const user = await db.user.findUnique({ where: { id: verificationId.userId } });
        if (!user || user.role !== "admin") {
            res.status(401).json({message: "invalid admin token"})
            return
        }
        req.adminId = verificationId.userId
        next()
    } catch(err) {
        res.status(401).json({message: "invalid admin token"})
        return
    }
}
