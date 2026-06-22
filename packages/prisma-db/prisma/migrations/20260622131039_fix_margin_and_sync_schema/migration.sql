/*
  Warnings:

  - You are about to drop the column `Margin` on the `Orders` table. All the data in the column will be lost.
  - You are about to drop the column `PositionType` on the `Positions` table. All the data in the column will be lost.
  - You are about to drop the column `positionStatus` on the `Positions` table. All the data in the column will be lost.
  - You are about to drop the `Balances` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `marketId` to the `Fills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalQty` to the `Fills` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxLeverage` to the `Markets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `averagePrice` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `closedAt` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entryPrice` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `leverage` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `liquidationPrice` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maintainanceMargin` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `margin` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `marketId` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `positionType` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qty` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `realisedPnL` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `Positions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unrealisedPnL` to the `Positions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'CANCLED';
ALTER TYPE "OrderStatus" ADD VALUE 'REJECTED';

-- DropForeignKey
ALTER TABLE "Balances" DROP CONSTRAINT "Balances_userId_fkey";

-- AlterTable
ALTER TABLE "Fills" ADD COLUMN     "marketId" TEXT NOT NULL,
ADD COLUMN     "originalQty" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "filledQty" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "remainingQty" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Markets" ADD COLUMN     "maxLeverage" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Orders" DROP COLUMN "Margin",
ADD COLUMN     "margin" DOUBLE PRECISION,
ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "qty" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Positions" DROP COLUMN "PositionType",
DROP COLUMN "positionStatus",
ADD COLUMN     "averagePrice" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "closedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "entryPrice" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "leverage" INTEGER NOT NULL,
ADD COLUMN     "liquidationPrice" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "maintainanceMargin" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "margin" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "marketId" TEXT NOT NULL,
ADD COLUMN     "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "positionType" "PositionType" NOT NULL,
ADD COLUMN     "qty" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "realisedPnL" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "status" "PositionStatus" NOT NULL,
ADD COLUMN     "unrealisedPnL" DOUBLE PRECISION NOT NULL;

-- DropTable
DROP TABLE "Balances";

-- CreateTable
CREATE TABLE "UserBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lockedBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBalance_userId_key" ON "UserBalance"("userId");

-- AddForeignKey
ALTER TABLE "Fills" ADD CONSTRAINT "Fills_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Positions" ADD CONSTRAINT "Positions_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBalance" ADD CONSTRAINT "UserBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
