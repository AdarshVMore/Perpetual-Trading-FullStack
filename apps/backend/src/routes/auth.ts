const user_JWT_SECRET = process.env.USER_JWT_SECRET ?? "user_secret"
const admin_JWT_Secret = process.env.ADMIN_JWT_SECRET ?? "admin_secret"

import { Router } from "express";
import type { Response, Request } from "express";
import bcrypt from "bcrypt"
import db from "@prisma-db"
import jwt from "jsonwebtoken"
import { userSchemaValidation, addBalanceSchema } from "@shared-types"
import { authUserMiddleware } from "../middleware/auth";
import { createRedisConnection } from "@redis-client";
import type { RedisClientType } from "redis";

const routes = Router()

let redisClient: RedisClientType | null;

async function connectRedisAuth() {
  redisClient = await createRedisConnection();
  return redisClient;
}

connectRedisAuth();

routes.post("/signup", async (req: Request, res: Response) => { 
  const result = userSchemaValidation.safeParse(req.body)
  if(!result.success){
    return res.status(400).json({
      error: result.error.flatten()
    })
  }

  const {email, password, role} = result.data

  try {
    const userExists = await db.user.findUnique({
      where: { email: email },
    });

    if (userExists) {
      return res.status(200).json({ message: "user already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const saveUser = await db.user.create({
      data: {
        email: email,
        password: hashedPassword.toString(),
        role: role,
        userBalance: {
          create: {
            availableBalance: 1_000_000,
            lockedBalance: 0,
          },
        },
      },
    });

    const JWT_SECRET = role === "admin" ? admin_JWT_Secret : user_JWT_SECRET

    const token = jwt.sign({ userId: saveUser.id, role: saveUser.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return res
      .status(200)
      .json({ message: "user signed up successfully!", token: token, userId: saveUser.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

routes.post("/signin", async (req:Request, res:Response) => {
  const { email, password } = req.body;
  try {
    const userExists = await db.user.findUnique({ where: { email: email } });
    if (!userExists) {
      return res.status(401).json({ message: "user does not exists" });
    }

    const passwordCheck = await bcrypt.compare(password, userExists.password);
    if (!passwordCheck) {
      return res.status(401).json({ message: "invalid password" });
    }

    const JWT_SECRET = userExists.role === "admin" ? admin_JWT_Secret : user_JWT_SECRET

    const token = jwt.sign({ userId: userExists.id, role: userExists.role }, JWT_SECRET, { expiresIn: "7d" });
    return res.status(200).json({ message: "user signed in", token: token, userId: userExists.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

const DEMO_EMAILS = ["demo_alice@perp.local", "demo_bob@perp.local"];

routes.get("/balance", authUserMiddleware, async (req: Request, res: Response) => {
  const balance = await db.userBalance.findUnique({ where: { userId: req.userId } });
  res.status(200).json({
    availableBalance: balance?.availableBalance ?? 0,
    lockedBalance: balance?.lockedBalance ?? 0,
  });
});

routes.get("/sim-bots", async (req: Request, res: Response) => {
  const prefix = String(req.query.prefix ?? "sim-bot").trim();
  if (!prefix) {
    return res.status(400).json({ message: "prefix is required" });
  }

  try {
    const users = await db.user.findMany({
      where: {
        email: { startsWith: `${prefix}` },
      },
      orderBy: { email: "asc" },
      select: { id: true, email: true },
    });

    const bots = users
      .filter((user) => user.email.endsWith("@perp.local"))
      .map((user) => ({
        userId: user.id,
        username: user.email.replace("@perp.local", ""),
      }));

    res.status(200).json({ bots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load simulation bots" });
  }
});

routes.get("/demo-users", async (_req: Request, res: Response) => {
  try {
    const users = await db.user.findMany({
      where: { email: { in: DEMO_EMAILS } },
      select: {
        id: true,
        email: true,
        userBalance: {
          select: { availableBalance: true, lockedBalance: true },
        },
        positions: {
          where: { status: "OPEN" },
          select: {
            marketId: true,
            qty: true,
            positionType: true,
            entryPrice: true,
          },
        },
        orders: {
          where: {
            orderStatus: { in: ["OPEN", "PARTIALLY_FILLED"] },
          },
          select: { id: true },
        },
      },
    });

    res.status(200).json({
      users: users.map((user) => ({
        userId: user.id,
        username: user.email.replace("@perp.local", ""),
        availableBalance: user.userBalance?.availableBalance ?? 0,
        lockedBalance: user.userBalance?.lockedBalance ?? 0,
        openPositions: user.positions.length,
        openOrders: user.orders.length,
        positions: user.positions,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load demo users" });
  }
});

routes.post("/add-balance", authUserMiddleware, async (req: Request, res: Response) => {
  const result = addBalanceSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error.flatten() });
  }

  const userId = req.userId!;
  const { amount } = result.data;

  if (!redisClient) {
    return res.status(400).json({ message: "unable to start redis" });
  }

  const balance = await db.userBalance.upsert({
    where: { userId },
    create: {
      userId,
      availableBalance: amount,
      lockedBalance: 0,
    },
    update: {
      availableBalance: { increment: amount },
    },
  });

  await redisClient.XADD("send-to-engine", "*", {
    type: "add-balance",
    userId,
    amount: amount.toString(),
  });

  res.status(200).json({
    availableBalance: balance.availableBalance,
    lockedBalance: balance.lockedBalance,
  });
});

export default routes
