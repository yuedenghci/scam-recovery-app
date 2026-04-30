-- CreateTable
CREATE TABLE "public"."DailyRecovery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recoveryDomain" TEXT NOT NULL,
    "difficultyNote" TEXT NOT NULL,
    "currentTaskText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecovery_userId_key" ON "public"."DailyRecovery"("userId");

-- AddForeignKey
ALTER TABLE "public"."DailyRecovery" ADD CONSTRAINT "DailyRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
