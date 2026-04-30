ALTER TABLE "Message" ADD COLUMN "suggestedAction" TEXT;

ALTER TABLE "DailyRecovery" ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyRecovery" ADD COLUMN "reminderTime" TEXT;
ALTER TABLE "DailyRecovery" ADD COLUMN "continuationPresetDays" INTEGER;
ALTER TABLE "DailyRecovery" ADD COLUMN "continuationReminderEnabled" BOOLEAN;
ALTER TABLE "DailyRecovery" ADD COLUMN "continuationReminderTime" TEXT;
ALTER TABLE "DailyRecovery" ADD COLUMN "continuationPromptDismissed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "DailyRecovery" SET "continuationPromptDismissed" = true;
