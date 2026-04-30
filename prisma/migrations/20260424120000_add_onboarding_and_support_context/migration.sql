-- CreateTable
CREATE TABLE "public"."OnboardingDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
    "openingAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "chatSnapshot" JSONB,
    "stepAudit" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSupportContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scamSituation" TEXT NOT NULL DEFAULT '',
    "scamImpact" TEXT NOT NULL DEFAULT '',
    "personality" TEXT NOT NULL DEFAULT '',
    "likedActivities" TEXT NOT NULL DEFAULT '',
    "expectedRole" TEXT NOT NULL DEFAULT '',
    "toneStyle" TEXT NOT NULL DEFAULT '',
    "proactiveLevel" TEXT NOT NULL DEFAULT '',
    "helpGoals" TEXT NOT NULL DEFAULT '',
    "manualModuleFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSupportContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingDraft_userId_key" ON "public"."OnboardingDraft"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSupportContext_userId_key" ON "public"."UserSupportContext"("userId");

-- AddForeignKey
ALTER TABLE "public"."OnboardingDraft" ADD CONSTRAINT "OnboardingDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSupportContext" ADD CONSTRAINT "UserSupportContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
