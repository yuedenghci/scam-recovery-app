import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type DoubaoGenerationMode =
  | "normal"
  | "proactive_opening"
  | "feedback_revision";

export type DoubaoGenerationContext = {
  systemPrompt: string;
  panelFeedbackNotes: string[];
  explicitFeedbackNotes: string[];
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  currentState: {
    emotional?: string | null;
    physical?: string | null;
    spatial?: string | null;
  } | null;
  latestUserMessage: string;
  /** 无新用户聊天文字（如仅提交反馈面板）：与主聊天同一套 messages，仅末条 user 提示不同。 */
  noNewUserMessage?: boolean;
  generationMode?: DoubaoGenerationMode;
  /** 可选补充块（如近期日记/日常恢复摘要），注入末条 user 提示前 */
  supplementaryContext?: string;
  llmOverrides?: { maxTokens?: number; temperature?: number };
};

export type DoubaoChatOutcome = {
  reply: string;
};

function formatNonEmpty(parts: Array<string | undefined | null>): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join("；");
}

/** 保留完整正文，只做轻量空白与换行规范化，避免“只取第一段”导致回复被截断。 */
function normalizeReplyText(text: string): string {
  let s = text.replace(/\r\n/g, "\n").trim();
  if (!s) return s;
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n");
  return s.replace(/\n{4,}/g, "\n\n\n").trim();
}

function extractJsonPayload(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}

function parseDoubaoJsonPayload(raw: string): DoubaoChatOutcome | null {
  const extracted = extractJsonPayload(raw);
  const payload = extracted ?? raw.trim();
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    const replyRaw = obj.reply;
    if (typeof replyRaw !== "string" || !replyRaw.trim()) {
      return null;
    }
    return {
      reply: normalizeReplyText(replyRaw),
    };
  } catch {
    return null;
  }
}

function validateDoubaoEnv(): { apiKey: string; baseURL: string; modelName: string } {
  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL;

  const missing: string[] = [];
  if (!apiKey) missing.push("ARK_API_KEY");
  if (!baseURL) missing.push("ARK_BASE_URL");
  if (!model) missing.push("ARK_MODEL");
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }

  return {
    apiKey: apiKey!,
    baseURL: baseURL!,
    modelName: model!,
  };
}

function buildDoubaoMessages(context: DoubaoGenerationContext): ChatCompletionMessageParam[] {
  const state = context.currentState;
  const stateText = state
    ? formatNonEmpty([
        state.emotional ? `情绪：${state.emotional}` : null,
        state.physical ? `身体：${state.physical}` : null,
        state.spatial ? `空间：${state.spatial}` : null,
      ])
    : "";

  const explicitNotesText = context.explicitFeedbackNotes
    .map((note) => note.trim())
    .filter(Boolean)
    .join("\n- ");
  const panelNotesText = context.panelFeedbackNotes
    .map((note) => note.trim())
    .filter(Boolean)
    .join("\n- ");

  const feedbackNotesText = [explicitNotesText, panelNotesText]
    .map((text) => text?.trim())
    .filter(Boolean)
    .join("\n- ");

  const mode = context.generationMode ?? "normal";

  const closingUserLine =
    mode === "proactive_opening"
      ? [
          "【本次生成类型】proactive_opening（用户刚打开聊天页，系统请求一条「主动开场」）。",
          "这不是普通追问式聊天，也不是反馈修订任务。用户此刻没有发送新文字。",
          "请写 1～3 句中文，语气轻、低压力，不要催促，不要要求用户复盘诈骗细节，不要用「检测到你很久没来」等机械句式。",
          "可以轻轻接住用户回来；可带一点温暖的好奇或小话题，但不要像推送通知。",
          "输出格式仍须遵守系统提示中的 JSON / 回复规范（与日常 support 一致）。",
        ].join("\n")
      : context.noNewUserMessage
        ? "本次用户未发送新的聊天文字。请根据对话上文、用户当前状态（如有）与近期用户反馈 notes，生成一条新的助手回复。"
        : `用户刚刚说的话：${context.latestUserMessage.trim()}`;

  const supplementary =
    typeof context.supplementaryContext === "string" &&
    context.supplementaryContext.trim()
      ? [
          "【近期活动摘要（仅供参考，不要逐条复述）】",
          context.supplementaryContext.trim(),
        ].join("\n")
      : "";
      
  const isNormalChat = !context.noNewUserMessage && mode !== "proactive_opening";

  const prompt = [
    "请基于以下信息生成回复。",
    isNormalChat
    ? "请优先回应用户刚刚说的话。其他信息是作为辅助参考，不要为了使用这些信息而偏离用户当前这句话。"
    : "",
    "避免反复重复前几轮已经说过的话；如果需要延续，请自然接着说。",
    supplementary,
    feedbackNotesText
      ? [
          "近期用户反馈 notes：",
          `- ${feedbackNotesText}`,
          "这些 notes 是对回应方式的约束。若 notes 之间冲突，优先更新、更具体的反馈。不要复述 notes。",
        ].join("\n")
      : "",
    stateText
      ? [
          `用户当前状态：${stateText}`,
          "状态仅作为理解用户当下处境的参考。不要机械复述。",
        ].join("\n")
      : "",
    closingUserLine,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    { role: "system", content: context.systemPrompt },
    ...context.chatHistory.map(
      (m): ChatCompletionMessageParam => ({
        role: m.role,
        content: m.content,
      }),
    ),
    { role: "user", content: prompt },
  ];
}

/**
 * Parses a full model completion string (non-streaming or buffered stream) into a
 * structured `reply` (JSON payload vs plain text). Use for `callDoubao`, tests,
 * suggested-action helpers, logging — not for persisting the live SSE body: the
 * streamed assistant text shown to the user is the concatenation of deltas and
 * should be stored as-is.
 */
export function normalizeDoubaoStreamedReply(replyBlock: string): DoubaoChatOutcome {
  const trimmed = replyBlock.trim();
  if (!trimmed) {
    throw new Error("Doubao returned empty reply");
  }

  const parsed = parseDoubaoJsonPayload(trimmed);
  if (parsed) {
    return parsed;
  }

  console.warn("callDoubao: JSON parse failed, falling back to plain text only");
  return {
    reply: normalizeReplyText(trimmed),
  };
}

export async function callDoubao(
  context: DoubaoGenerationContext,
): Promise<DoubaoChatOutcome> {
  const { apiKey, baseURL, modelName } = validateDoubaoEnv();
  const messages = buildDoubaoMessages(context);

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const maxTokens = context.llmOverrides?.maxTokens ?? 384;
  const temperature = context.llmOverrides?.temperature ?? 0.4;

  const completion = await client.chat.completions.create({
    model: modelName,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const replyBlock = completion.choices?.[0]?.message?.content?.trim();
  if (!replyBlock) {
    throw new Error("Doubao returned empty reply");
  }

  return normalizeDoubaoStreamedReply(replyBlock);
}

export async function createDoubaoStream(context: DoubaoGenerationContext) {
  const { apiKey, baseURL, modelName } = validateDoubaoEnv();
  const messages = buildDoubaoMessages(context);

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const maxTokens = context.llmOverrides?.maxTokens ?? 384;
  const temperature = context.llmOverrides?.temperature ?? 0.4;

  return client.chat.completions.create({
    model: modelName,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });
}
