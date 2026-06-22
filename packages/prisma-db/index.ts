import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
export type { OrderStatus, OrderType, PositionType, PositionStatus } from "./generated/prisma/client";

console.log(process.env.DATABASE_URL);

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/perp?schema=public" });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export default db
