import { buildGenerationContext } from "@/lib/buildGenerationContext";
import { createDoubaoStream } from "@/lib/callDoubao";
import { buildProactiveSupplementaryContext } from "@/lib/buildProactiveOpeningContextExtras";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const encoder = new TextEncoder();

function encodeSse(event: string, data: unknown) {
  return encoder.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

const FIVE_MIN_MS = 5 * 60 * 1000;
const SIX_H_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录", shouldGenerate: false },
        { status: 401 },
      );
    }

    const supportContext = await prisma.userSupportContext.findUnique({
      where: { userId },
    });
    const pref = supportContext?.proactivePreference?.trim() ?? "";
    if (!pref || pref === "passive") {
      return Response.json({ shouldGenerate: false });
    }
    if (pref !== "moderate" && pref !== "active") {
      return Response.json({ shouldGenerate: false });
    }

    const [
      onboardingGreeting,
      lastProactive,
      lastUserMsg,
      userMessageCount,
      currentState,
      recentPanelFeedbackNotes,
      recentExplicitFeedbackNotes,
      supplementary,
    ] = await Promise.all([
      prisma.message.findFirst({
        where: { userId, role: "assistant", mode: "onboarding_greeting" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.message.findFirst({
        where: { userId, mode: "proactive_opening" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.message.findFirst({
        where: { userId, role: "user" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.message.count({ where: { userId, role: "user" } }),
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
      buildProactiveSupplementaryContext(userId),
    ]);

    if (!onboardingGreeting) {
      return Response.json({ shouldGenerate: false });
    }

    if (userMessageCount < 1) {
      return Response.json({ shouldGenerate: false });
    }

    const now = Date.now();
    if (
      lastUserMsg &&
      now - lastUserMsg.createdAt.getTime() < FIVE_MIN_MS
    ) {
      return Response.json({ shouldGenerate: false });
    }

    const interval = pref === "active" ? SIX_H_MS : TWENTY_FOUR_H_MS;
    if (
      lastProactive &&
      now - lastProactive.createdAt.getTime() < interval
    ) {
      return Response.json({ shouldGenerate: false });
    }

    const panelFeedbackNotes = recentPanelFeedbackNotes
      .map((item) => item.llmNote?.trim() ?? "")
      .filter(Boolean);

    const explicitFeedbackNotes = recentExplicitFeedbackNotes
      .map((item) => item.llmNote?.trim() ?? "")
      .filter(Boolean);

    const recentChatHistoryDesc = await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const recentChatHistory = [...recentChatHistoryDesc].reverse();

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
      generationMode: "proactive_opening" as const,
      latestUserMessage: "",
      supplementaryContext: supplementary || undefined,
      llmOverrides: { maxTokens: 320, temperature: 0.45 },
    };

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
            /* ignore */
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

        try {
          if (!enqueueSse("meta", { shouldGenerate: true })) {
            return;
          }

          const completionStream = await createDoubaoStream(generationContext);
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

          if (clientDisconnected || streamClosed) {
            return;
          }

          const assistantContent = accumulatedRaw;
          if (!assistantContent.trim()) {
            enqueueSse("error", { message: "生成失败，请稍后再试" });
            safeClose();
            return;
          }

          const saved = await prisma.message.create({
            data: {
              userId,
              role: "assistant",
              content: assistantContent,
              mode: "proactive_opening",
            },
          });

          enqueueSse("done", {
            messageId: saved.id,
            suggestedAction: null,
          });
          safeClose();
        } catch (e) {
          console.error("proactive-opening stream:", e);
          enqueueSse("error", { message: "生成失败，请稍后再试" });
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
  } catch (e) {
    console.error("proactive-opening:", e);
    return Response.json(
      {
        ok: false,
        shouldGenerate: false,
        error: e instanceof Error ? e.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
