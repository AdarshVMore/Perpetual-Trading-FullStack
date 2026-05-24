/*
  Warnings:

  - You are about to drop the column `marketType` on the `Orders` table. All the data in the column will be lost.
  - Added the required column `orderType` to the `Orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `PositionType` to the `Positions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');

-- AlterTable
ALTER TABLE "Orders" DROP COLUMN "marketType",
ADD COLUMN     "orderType" "OrderType" NOT NULL;

-- AlterTable
ALTER TABLE "Positions" ADD COLUMN     "PositionType" "PositionType" NOT NULL;

-- DropEnum
DROP TYPE "MarketType";
