import dotenv from "dotenv";

dotenv.config();

import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  console.log(process.env.DATABASE_URL);
  return new PrismaClient();

};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma: ReturnType<typeof prismaClientSingleton> = 
  globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;