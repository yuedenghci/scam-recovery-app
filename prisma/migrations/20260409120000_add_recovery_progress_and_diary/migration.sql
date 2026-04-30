-- CreateTable
CREATE TABLE "public"."RecoveryProgressState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStage" INTEGER NOT NULL DEFAULT 0,
    "lastLetterGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryProgressState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecoveryProgressEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "scoreDelta" DOUBLE PRECISION NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "eventDay" TEXT NOT NULL,
    "sourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryProgressEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiaryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "entryDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProgressLetter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "context" JSONB,

    CONSTRAINT "ProgressLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryProgressState_userId_key" ON "public"."RecoveryProgressState"("userId");

-- CreateIndex
CREATE INDEX "RecoveryProgressEvent_userId_eventDate_idx" ON "public"."RecoveryProgressEvent"("userId", "eventDate");

-- CreateIndex
CREATE INDEX "RecoveryProgressEvent_userId_eventType_eventDay_idx" ON "public"."RecoveryProgressEvent"("userId", "eventType", "eventDay");

-- CreateIndex
CREATE INDEX "RecoveryProgressEvent_userId_createdAt_idx" ON "public"."RecoveryProgressEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryEntry_userId_entryDay_key" ON "public"."DiaryEntry"("userId", "entryDay");

-- CreateIndex
CREATE INDEX "DiaryEntry_userId_createdAt_idx" ON "public"."DiaryEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressLetter_userId_createdAt_idx" ON "public"."ProgressLetter"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressLetter_userId_isRead_createdAt_idx" ON "public"."ProgressLetter"("userId", "isRead", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."RecoveryProgressState" ADD CONSTRAINT "RecoveryProgressState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecoveryProgressEvent" ADD CONSTRAINT "RecoveryProgressEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DiaryEntry" ADD CONSTRAINT "DiaryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProgressLetter" ADD CONSTRAINT "ProgressLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
