-- DropIndex
DROP INDEX "public"."DailyRecovery_userId_key";

-- AlterTable
ALTER TABLE "public"."DailyRecovery" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."DailyRecoveryStatusLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyRecoveryId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRecoveryStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DailyRecoveryEventLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyRecoveryId" TEXT,
    "eventType" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRecoveryEventLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."DailyRecoveryStatusLog" ADD CONSTRAINT "DailyRecoveryStatusLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyRecoveryStatusLog" ADD CONSTRAINT "DailyRecoveryStatusLog_dailyRecoveryId_fkey" FOREIGN KEY ("dailyRecoveryId") REFERENCES "public"."DailyRecovery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyRecoveryEventLog" ADD CONSTRAINT "DailyRecoveryEventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DailyRecoveryEventLog" ADD CONSTRAINT "DailyRecoveryEventLog_dailyRecoveryId_fkey" FOREIGN KEY ("dailyRecoveryId") REFERENCES "public"."DailyRecovery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
