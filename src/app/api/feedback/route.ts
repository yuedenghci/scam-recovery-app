import { buildGenerationContext } from "@/lib/buildGenerationContext";
import { createDoubaoStream } from "@/lib/callDoubao";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { summarizeFeedbackNote } from "@/lib/summarizeFeedbackNote";

const encoder = new TextEncoder();

function encodeSse(event: string, data: unknown) {
  return encoder.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json(
      { ok: false, error: "未登录，无法提交反馈" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const messageId = body.messageId;
  const selectedReasonsRaw = body.selectedReasons ?? body.selectedReason;
  const otherText = body.otherText;
  const assistantReplyText = body.assistantReplyText;

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
      return selectedReasonsRaw.map((x) => String(x)).map((x) => x.trim()).filter(Boolean);
    }
    if (typeof selectedReasonsRaw === "string") {
      return selectedReasonsRaw
        .split("、")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    return [String(selectedReasonsRaw).trim()].filter(Boolean);
  })();

  if (selectedReasons.length === 0) {
    return Response.json(
      { ok: false, error: "请选择至少一项原因" },
      { status: 400 },
    );
  }

  const includesOther = selectedReasons.includes("其他");
  const otherStr =
    typeof otherText === "string"
      ? otherText
      : otherText != null
        ? String(otherText)
        : "";

  if (includesOther && otherStr.trim() === "") {
    return Response.json(
      { ok: false, error: "请补充说明具体哪里不合适" },
      { status: 400 },
    );
  }

  let resolvedMessageId: string | null = null;
  if (messageId !== undefined && messageId !== null && messageId !== "") {
    const candidate =
      typeof messageId === "string" ? messageId : String(messageId);
    const trimmed = candidate.trim();
    if (trimmed !== "") {
      const existing = await prisma.message.findUnique({
        where: { id: trimmed },
      });
      if (existing) {
        resolvedMessageId = trimmed;
      }
    }
  }

  const latestCurrentState = await prisma.currentState.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  let currentStateSnapshot: string | null = null;
  if (latestCurrentState) {
    currentStateSnapshot = JSON.stringify({
      emotional: latestCurrentState.emotional,
      physical: latestCurrentState.physical,
      spatial: latestCurrentState.spatial,
      createdAt: latestCurrentState.createdAt,
    });
  }

  const reasonStr = selectedReasons.join("、");
  const otherTextStored: string | null = includesOther
    ? otherStr.trim() === ""
      ? null
      : otherStr.trim()
    : null;

  const assistantStr =
    assistantReplyText === undefined || assistantReplyText === null
      ? ""
      : typeof assistantReplyText === "string"
        ? assistantReplyText
        : String(assistantReplyText);

  if (!assistantStr.trim()) {
    return Response.json(
      { ok: false, error: "缺少被反馈的助手原文" },
      { status: 400 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        try {
          controller.enqueue(encodeSse(event, data));
        } catch {
          /* stream may be closed */
        }
      };

      try {
        const llmNote = await summarizeFeedbackNote({
          feedbackSource: "panel",
          selectedReason: reasonStr,
          otherText: otherTextStored,
          assistantReplyText: assistantStr,
          currentStateSnapshot,
        });

        const pendingFeedback = await prisma.feedbackRecord.create({
          data: {
            userId,
            feedbackSource: "panel",
            messageId: resolvedMessageId,
            selectedReason: reasonStr,
            otherText: otherTextStored,
            assistantReplyText: assistantStr,
            revisedAssistantReplyText: null,
            currentStateSnapshot,
            llmNote,
          },
        });

        const [
          supportContext,
          currentState,
          recentPanelFeedbackNotes,
          recentExplicitFeedbackNotes,
        ] = await Promise.all([
          (prisma as typeof prisma & {
            userSupportContext: {
              findUnique: (args: { where: { userId: string } }) => Promise<{
                scamSituation: string;
                scamImpact: string;
                personality: string;
                likedActivities: string;
                expectedRole: string;
                toneStyle: string;
                proactiveLevel: string;
                helpGoals: string;
              } | null>;
            };
          }).userSupportContext.findUnique({
            where: { userId },
          }),
          prisma.currentState.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
          }),
          prisma.feedbackRecord.findMany({
            where: {
              userId,
              feedbackSource: "panel",
              llmNote: { not: null },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
          prisma.feedbackRecord.findMany({
            where: {
              userId,
              feedbackSource: "explicit_text",
              llmNote: { not: null },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          }),
        ]);

        const panelFeedbackNotes = recentPanelFeedbackNotes
          .map((item) => item.llmNote?.trim() ?? "")
          .filter(Boolean);

        const explicitFeedbackNotes = recentExplicitFeedbackNotes
          .map((item) => item.llmNote?.trim() ?? "")
          .filter(Boolean);

        const recentChatHistoryDesc = (await prisma.message.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 20,
        })) as Array<{ id: string; role: string; content: string }>;

        const recentChatHistory = recentChatHistoryDesc.reverse();

        const priorConversation = recentChatHistory
          .filter((msg) => msg.role === "user" || msg.role === "assistant")
          .map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }));

        const generationContext = {
          ...buildGenerationContext(
            supportContext,
            currentState,
            "",
            panelFeedbackNotes,
            explicitFeedbackNotes,
            priorConversation,
          ),
          noNewUserMessage: true as const,
        };

        const completionStream = await createDoubaoStream(generationContext);

        let accumulatedRaw = "";
        for await (const chunk of completionStream) {
          if (request.signal.aborted) {
            break;
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            accumulatedRaw += delta;
            enqueue("delta", { text: delta });
          }
        }

        if (request.signal.aborted) {
          return;
        }

        const revisedText = accumulatedRaw.trim();
        if (!revisedText) {
          enqueue("error", {
            message: "暂时无法生成修订回复，请稍后再试",
          });
          return;
        }

        const revisedMessage = await prisma.message.create({
          data: {
            userId,
            role: "assistant",
            content: revisedText,
            mode: "feedback_revision",
          },
        });

        await prisma.feedbackRecord.update({
          where: { id: pendingFeedback.id },
          data: { revisedAssistantReplyText: revisedText },
        });

        enqueue("done", {
          revisedMessageId: revisedMessage.id,
          revisedText,
        });
      } catch (error) {
        console.error("Failed to save feedback stream:", error);
        enqueue("error", {
          message: "提交失败，请稍后再试",
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
