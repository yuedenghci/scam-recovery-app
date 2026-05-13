import { buildGenerationContext } from "@/lib/buildGenerationContext";
import { createDoubaoStream } from "@/lib/callDoubao";
import { detectExplicitFeedback } from "@/lib/extractExplicitFeedback";
import { extractActionableRecoveryStep } from "@/lib/extractActionableRecoveryStep";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeFeedbackNote } from "@/lib/summarizeFeedbackNote";

const encoder = new TextEncoder();

function encodeSse(event: string, data: unknown) {
  return encoder.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const logChatTiming = (label: string) => {
    console.log(`[chat] ${label}`, Date.now() - requestStartedAt);
  };

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { ok: false, error: "Message is required" },
        { status: 400 },
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
        { status: 400 },
      );
    }

    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，请先登录后再使用支持对话" },
        { status: 401 },
      );
    }
    logChatTiming("auth done");

    const [
      supportContext,
      currentState,
      latestAssistantMessage,
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
      prisma.message.findFirst({
        where: { userId, role: "assistant" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.feedbackRecord.findMany({
        where: {
          userId,
          feedbackSource: "panel",
          llmNote: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.feedbackRecord.findMany({
        where: {
          userId,
          feedbackSource: "explicit_text",
          llmNote: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    logChatTiming("initial context queries done");

    const panelFeedbackNotes = recentPanelFeedbackNotes
      .map((item) => item.llmNote?.trim() ?? "")
      .filter(Boolean);

    const explicitFeedbackNotes = recentExplicitFeedbackNotes
      .map((item) => item.llmNote?.trim() ?? "")
      .filter(Boolean);

    const savedUserMessage = await prisma.message.create({
      data: {
        userId,
        role: "user",
        content: trimmed,
      },
    });
    logChatTiming("user message saved");

    const recentChatHistoryDesc = (await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    })) as Array<{ id: string; role: string; content: string }>;
    logChatTiming("chat history loaded");

    const recentChatHistory = recentChatHistoryDesc.reverse();

    const priorConversation = recentChatHistory
      .filter(
        (msg) =>
          msg.id !== savedUserMessage.id &&
          (msg.role === "user" || msg.role === "assistant"),
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
      priorConversation,
    );

    const currentStateSnapshot: string | null = currentState
      ? JSON.stringify({
          emotional: currentState.emotional,
          physical: currentState.physical,
          spatial: currentState.spatial,
          createdAt: currentState.createdAt,
        })
      : null;

    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false;

        const safeEnqueue = (chunk: Uint8Array): boolean => {
          if (streamClosed) return false;
          try {
            controller.enqueue(chunk);
            return true;
          } catch {
            streamClosed = true;
            return false;
          }
        };

        const safeClose = () => {
          if (streamClosed) return;
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // ignore double-close / already-closed
          }
        };

        const enqueueSse = (event: string, data: unknown): boolean => {
          return safeEnqueue(encodeSse(event, data));
        };

        let clientDisconnected = false;
        const onClientAbort = () => {
          clientDisconnected = true;
          safeClose();
        };
        request.signal.addEventListener("abort", onClientAbort, { once: true });

        let savedAssistantMessage: { id: string };

        try {
          const completionStream = await createDoubaoStream(generationContext);
          logChatTiming("LLM stream created");

          let accumulatedRaw = "";

          for await (const chunk of completionStream) {
            if (request.signal.aborted || clientDisconnected || streamClosed) {
              break;
            }
            const delta = chunk.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              accumulatedRaw += delta;
              if (!enqueueSse("delta", { text: delta })) {
                break;
              }
            }
          }
          logChatTiming("LLM stream finished");

          if (clientDisconnected || streamClosed) {
            return;
          }

          // Persist exactly what was streamed (same concatenation as frontend deltas).
          const assistantContent = accumulatedRaw;
          if (!assistantContent.trim()) {
            enqueueSse("error", { message: "发送失败，请重试" });
            safeClose();
            return;
          }

          savedAssistantMessage = await prisma.message.create({
            data: {
              userId,
              role: "assistant",
              content: assistantContent,
            },
          });
          logChatTiming("assistant message saved");

          void (async () => {
            try {
              const extracted = await extractActionableRecoveryStep({
                replyText: assistantContent,
              });
              const suggestedAction =
                extracted.hasActionableRecoveryStep &&
                typeof extracted.suggestedAction === "string"
                  ? extracted.suggestedAction.trim()
                  : null;

              const suggestedActionSafe =
                suggestedAction && assistantContent.includes(suggestedAction)
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
                  revisedAssistantReplyText: assistantContent,
                  messageId: latestAssistantMessage.id,
                  currentStateSnapshot,
                  llmNote: explicitLlmNote,
                },
              });
            } catch (e) {
              console.error("explicit feedback background task failed:", e);
            }
          })();

          if (!enqueueSse("done", {
            messageId: savedAssistantMessage.id,
            suggestedAction: null,
          })) {
            return;
          }
          safeClose();
        } catch (e) {
          console.error("chat SSE stream processing failed:", e);
          enqueueSse("error", { message: "发送失败，请重试" });
          safeClose();
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
  } catch (error) {
    console.error("Failed to process chat:", error);
    return Response.json(
      {
        ok: false,
        error: "Failed to process chat",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
