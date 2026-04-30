import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { summarizeFeedbackNote } from "@/lib/summarizeFeedbackNote";

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法提交反馈" },
        { status: 401 },
      );
    }
    const body = (await request.json()) as Record<string, unknown>;

    const messageId = body.messageId
    const selectedReasonsRaw = body.selectedReasons ?? body.selectedReason
    const otherText = body.otherText
    const assistantReplyText = body.assistantReplyText

    if (
      selectedReasonsRaw === undefined ||
      selectedReasonsRaw === null ||
      selectedReasonsRaw === ""
    ) {
      return Response.json(
        { ok: false, error: "selectedReasons is required" },
        { status: 400 },
      );
    }

    const selectedReasons: string[] = (() => {
      if (Array.isArray(selectedReasonsRaw)) {
        return selectedReasonsRaw.map((x) => String(x)).map((x) => x.trim()).filter(Boolean)
      }
      if (typeof selectedReasonsRaw === "string") {
        return selectedReasonsRaw
          .split("、")
          .map((x) => x.trim())
          .filter(Boolean)
      }
      return [String(selectedReasonsRaw).trim()].filter(Boolean)
    })()

    if (selectedReasons.length === 0) {
      return Response.json(
        { ok: false, error: "请选择至少一项原因" },
        { status: 400 },
      );
    }

    const includesOther = selectedReasons.includes("其他")
    const otherStr =
      typeof otherText === "string"
        ? otherText
        : otherText != null
          ? String(otherText)
          : ""

    if (includesOther && otherStr.trim() === "") {
      return Response.json(
        { ok: false, error: "请补充说明具体哪里不合适" },
        { status: 400 },
      );
    }

    let resolvedMessageId: string | null = null
    if (messageId !== undefined && messageId !== null && messageId !== "") {
      const candidate =
        typeof messageId === "string" ? messageId : String(messageId)
      const trimmed = candidate.trim()
      if (trimmed !== "") {
        const existing = await prisma.message.findUnique({
          where: { id: trimmed },
        })
        if (existing) {
          resolvedMessageId = trimmed
        }
      }
    }

    const latestCurrentState = await prisma.currentState.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    let currentStateSnapshot: string | null = null
    if (latestCurrentState) {
      currentStateSnapshot = JSON.stringify({
        emotional: latestCurrentState.emotional,
        physical: latestCurrentState.physical,
        spatial: latestCurrentState.spatial,
        createdAt: latestCurrentState.createdAt,
      })
    }

    const reasonStr = selectedReasons.join("、")
    const otherTextStored: string | null = includesOther
      ? otherStr.trim() === ""
        ? null
        : otherStr.trim()
      : null

    const assistantStr =
      assistantReplyText === undefined || assistantReplyText === null
        ? ""
        : typeof assistantReplyText === "string"
          ? assistantReplyText
          : String(assistantReplyText)

    const llmNote = await summarizeFeedbackNote({
      feedbackSource: "panel",
      selectedReason: reasonStr,
      otherText: otherTextStored,
      assistantReplyText: assistantStr,
      currentStateSnapshot,
    });

    const savedFeedback = await prisma.feedbackRecord.create({
      data: {
        userId,
        feedbackSource: "panel",
        messageId: resolvedMessageId,
        selectedReason: reasonStr,
        otherText: otherTextStored,
        assistantReplyText: assistantStr,
        currentStateSnapshot,
        llmNote,
      },
    });

    console.log("Saved feedback record:", savedFeedback);

    return Response.json({ ok: true, message: "Feedback saved" });
  } catch (error) {
    console.error("Failed to save feedback:", error);
    return Response.json(
      {
        ok: false,
        error: "Failed to save feedback",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
