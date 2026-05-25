// admin/signup
// user/signup


// seperate jwt_secret for both

const JWT_SECRET = ""

import { Router } from "express";
import type { Response, Request } from "express";
import bcrypt from "bcrypt"
import db from "@prisma-db"
import jwt from "jsonwebtoken"
import {userSchemaValidation} from "@shared-types"

const routes = Router()

routes.post("/signup", async (req: Request, res: Response) => {
  // used GPT to solve an issue here => "userSchemaValidation.safeParse" does not return the object defined of types directly
  // it sends {sucess:"", data:"", error:""} and so object is in .data so need to check if result.sucess first and then email is result.data.email
  const result = userSchemaValidation.safeParse(req.body)
  if(!result.success){
    return res.status(200).json({
      error: result.error.flatten() // .flatten() gives you clean frontendFriendly error instead of showing you huge object of error => gives you one-line error about the issue
    })
  }

  const {email, password} = result.data

  try {
    const userExists = await db.user.findUnique({
      where: { email: email },
    });

    if (userExists) {
      res.json({ message: "user already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const saveUser = await db.user.create({
      data: { email: email, password: hashedPassword },
    });

    const token = jwt.sign({ email: email }, JWT_SECRET, {
      expiresIn: "7d",
    });
    if (!token) {
      console.log("token not generated");
    }

    if (saveUser) {
      res
        .status(200)
        .json({ message: "user signed up sucessfullllly!", token: token });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json({ message: err });
  }
});

routes.post("/signin", async (req:Request, res:Response) => {
  const { email, password } = req.body;
  try {
    const userExists = await db.user.findUnique({ where: { email: email } });
    if (!userExists) {
      return res.json({ message: "user does not exists" });
    }

    const passwordCheck = await bcrypt.compare(password, userExists?.password);
    if (passwordCheck) {
      const token = jwt.sign({ email: email }, JWT_SECRET, { expiresIn: "7d" });
      console.log("token for signedIn user = ", token);
      return res.status(200).json({ message: "user signed In", token: token });
    }
  } catch (err) {
    console.log(err);
    res.status(400).json({ message: err });
  }
});



export default routes




// admin/signin
// user/signin