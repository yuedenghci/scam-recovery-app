-- CreateTable
CREATE TABLE "public"."CurrentState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emotional" TEXT,
    "physical" TEXT,
    "spatial" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrentState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeedbackRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "feedbackSource" TEXT NOT NULL,
    "selectedReason" TEXT,
    "otherText" TEXT,
    "assistantReplyText" TEXT NOT NULL,
    "currentStateSnapshot" TEXT,
    "llmNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."CurrentState" ADD CONSTRAINT "CurrentState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedbackRecord" ADD CONSTRAINT "FeedbackRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeedbackRecord" ADD CONSTRAINT "FeedbackRecord_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
