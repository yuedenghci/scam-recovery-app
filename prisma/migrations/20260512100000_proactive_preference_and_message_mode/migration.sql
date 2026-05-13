-- AlterTable
ALTER TABLE "UserSupportContext" ADD COLUMN IF NOT EXISTS "proactivePreference" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mode" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Message_userId_mode_idx" ON "Message"("userId", "mode");
