-- AlterTable
ALTER TABLE "DailyRecovery" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "FeedbackRecord" ADD COLUMN "revisedAssistantReplyText" TEXT;
