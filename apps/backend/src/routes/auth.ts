// admin/signup
// user/signup


// seperate jwt_secret for both

const JWT_SECRET = "secret"

import { Router } from "express";
import type { Response, Request } from "express";
import bcrypt from "bcrypt"
import db from "@prisma-db"
import jwt from "jsonwebtoken"
import {userSchemaValidation} from "@shared-types"

const routes = Router()

routes.post("/signup", async (req: Request, res: Response) => {
  const result = userSchemaValidation.safeParse(req.body)
  if(!result.success){
    return res.status(400).json({
      error: result.error.flatten()
    })
  }

  const {email, password} = result.data

  try {
    const userExists = await db.user.findUnique({
      where: { email: email },
    });

    if (userExists) {
      return res.status(200).json({ message: "user already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const saveUser = await db.user.create({
      data: { email: email, password: hashedPassword.toString() },
    });

    const token = jwt.sign({ userId: saveUser.id }, JWT_SECRET, {
      expiresIn: "7d",
    });

    return res
      .status(200)
      .json({ message: "user signed up successfully!", token: token });
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

    const token = jwt.sign({ userId: userExists.id }, JWT_SECRET, { expiresIn: "7d" });
    return res.status(200).json({ message: "user signed in", token: token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
});



export default routes




// admin/signin
// user/signin