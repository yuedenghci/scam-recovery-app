import { buildGenerationContext } from "@/lib/buildGenerationContext";
import { callDoubao } from "@/lib/callDoubao";
import { detectExplicitFeedback } from "@/lib/extractExplicitFeedback";
import { extractActionableRecoveryStep } from "@/lib/extractActionableRecoveryStep";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeFeedbackNote } from "@/lib/summarizeFeedbackNote";
type FeedbackNoteRecord = { feedbackSource: string; llmNote: string | null };

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { ok: false, error: "Message is required" },
        { status: 400 }
      );
    }

    const message =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : "";

    const trimmed = message.trim();
    if (!trimmed) {
      return Response.json(
        { ok: false, error: "Message is required" },
        { status: 400 }
      );
    }

    // 快路径：只做生成主回复所需的最小读取；把“显式反馈检测/写库”和“suggestedAction 提取/写库”都改成后台异步。
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，请先登录后再使用支持对话" },
        { status: 401 },
      );
    }

    const [supportContext, currentState, latestAssistantMessage, recentFeedbackWithNotes] =
      await Promise.all([
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
        prisma.message.findFirst({
          where: { userId, role: "assistant" },
          orderBy: { createdAt: "desc" },
        }),
        (prisma.feedbackRecord.findMany({
          where: {
            userId,
            llmNote: {
              not: null,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })) as Promise<FeedbackNoteRecord[]>,
      ]);

    const panelFeedbackNotes = recentFeedbackWithNotes
      .filter(
        (item) =>
          item.feedbackSource === "panel" && (item.llmNote ?? "").trim() !== ""
      )
      .slice(0, 10)
      .map((item) => (item.llmNote ?? "").trim());

    const explicitFeedbackNotes = recentFeedbackWithNotes
      .filter(
        (item) =>
          item.feedbackSource === "explicit_text" &&
          (item.llmNote ?? "").trim() !== ""
      )
      .slice(0, 10)
      .map((item) => (item.llmNote ?? "").trim());

    const savedUserMessage = await prisma.message.create({
      data: {
        userId,
        role: "user",
        content: trimmed,
      },
    });

    const recentChatHistoryDesc = (await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    })) as Array<{ id: string; role: string; content: string }>;
    const recentChatHistory = recentChatHistoryDesc.reverse();

    const priorConversation = recentChatHistory
      .filter(
        (msg) =>
          msg.id !== savedUserMessage.id &&
          (msg.role === "user" || msg.role === "assistant")
      )
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

    const generationContext = buildGenerationContext(
      supportContext,
      currentState,
      trimmed,
      panelFeedbackNotes,
      explicitFeedbackNotes,
      priorConversation
    );

    const { reply } = await callDoubao({
      ...generationContext,
    });

    const savedAssistantMessage = await prisma.message.create({
      data: {
        userId,
        role: "assistant",
        content: reply,
      },
    });

    const currentStateSnapshot: string | null = currentState
      ? JSON.stringify({
          emotional: currentState.emotional,
          physical: currentState.physical,
          spatial: currentState.spatial,
          createdAt: currentState.createdAt,
        })
      : null;

    // 后台任务 1：从 assistant reply 里提取 suggestedAction，并把它写回 Message 表（用于前端增量显示“加入日常恢复”按钮）。
    void (async () => {
      try {
        const extracted = await extractActionableRecoveryStep({
          replyText: reply,
        });
        const suggestedAction =
          extracted.hasActionableRecoveryStep &&
          typeof extracted.suggestedAction === "string"
            ? extracted.suggestedAction.trim()
            : null;

        const suggestedActionSafe =
          suggestedAction && reply.includes(suggestedAction)
            ? suggestedAction
            : null;

        if (!suggestedActionSafe) return;

        await prisma.message.update({
          where: { id: savedAssistantMessage.id },
          data: { suggestedAction: suggestedActionSafe },
        });

        await prisma.dailyRecoveryEventLog.create({
          data: {
            userId,
            eventType: "assistant_message_suggested_action",
            detail: {
              messageId: savedAssistantMessage.id,
              suggestedAction: suggestedActionSafe,
            },
          },
        });
      } catch (e) {
        console.error("suggestedAction background task failed:", e);
      }
    })();

    // 后台任务 2：对“上一条助手回复”做 explicit feedback 检测，并写入 feedbackRecord。
    void (async () => {
      try {
        if (!latestAssistantMessage) return;

        const explicitDetection = await detectExplicitFeedback({
          userMessage: trimmed,
          latestAssistantReplyText: latestAssistantMessage.content,
        });

        if (!explicitDetection.isExplicitFeedback) return;

        const explicitLlmNote = await summarizeFeedbackNote({
          feedbackSource: "explicit_text",
          selectedReason: "explicit_textual_feedback",
          otherText: trimmed,
          userMessage: trimmed,
          assistantReplyText: latestAssistantMessage.content,
          currentStateSnapshot,
        });

        await prisma.feedbackRecord.create({
          data: {
            userId,
            feedbackSource: "explicit_text",
            selectedReason: "explicit_textual_feedback",
            otherText: trimmed,
            assistantReplyText: latestAssistantMessage.content,
            messageId: latestAssistantMessage.id,
            currentStateSnapshot,
            llmNote: explicitLlmNote,
          },
        });
      } catch (e) {
        console.error("explicit feedback background task failed:", e);
      }
    })();

    return Response.json({
      ok: true,
      reply,
      suggestedAction: null,
      messageId: savedAssistantMessage.id,
    });
  } catch (error) {
    console.error("Failed to process chat:", error);
    return Response.json(
      {
        ok: false,
        error: "Failed to process chat",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
