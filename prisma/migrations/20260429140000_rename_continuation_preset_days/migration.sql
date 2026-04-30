-- Rename to reflect user-entered days (not fixed presets)
ALTER TABLE "DailyRecovery" RENAME COLUMN "continuationPresetDays" TO "continuationDays";
