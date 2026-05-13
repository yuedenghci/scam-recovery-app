-- Allow multiple diary entries per user per calendar day (entryDay still stored for semantics).
DROP INDEX IF EXISTS "DiaryEntry_userId_entryDay_key";
