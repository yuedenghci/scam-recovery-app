import OpenAI from "openai";

type DoubaoGenerationContext = {
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
};

export type DoubaoChatOutcome = {
  reply: string;
};

function formatNonEmpty(parts: Array<string | undefined | null>): string {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean).join("；");
}

const REPLY_ONLY_INSTRUCTION = `
你只需要输出给用户的自然对话回复正文。
除回复正文外不要输出任何其它文字、Markdown 或 JSON。
`;

function sanitizeReplyParagraph(text: string): string {
  const firstParagraph = text.split(/\n{2,}/)[0].trim();
  return firstParagraph.replace(/\s+/g, " ");
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
      reply: sanitizeReplyParagraph(replyRaw),
    };
  } catch {
    return null;
  }
}

export async function callDoubao(
  context: DoubaoGenerationContext,
): Promise<DoubaoChatOutcome> {
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
  const modelName = model as string;

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

  const prompt = [
    "请基于以下信息生成回复。",
    "若信息冲突，严格按优先级执行：",
    "1. 用户在文字中明确给的反馈",
    "2. feedback 面板中的反馈",
    "3. 用户当前状态",
    "不要机械复述这些反馈说明，只把它们当作回应方式的约束。",
    explicitNotesText ? `近期文字中明确反馈的总结 notes：\n- ${explicitNotesText}` : "",
    panelNotesText ? `近期反馈面板总结 notes：\n- ${panelNotesText}` : "",
    stateText ? `用户当前状态：${stateText}` : "",
    `用户刚刚说的话：${context.latestUserMessage.trim()}`
  ]
    .filter(Boolean)
    .join("\n");

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const completion = await client.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: context.systemPrompt },
      ...context.chatHistory,
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 384,
  });

  const replyBlock = completion.choices?.[0]?.message?.content?.trim();
  if (!replyBlock) {
    throw new Error("Doubao returned empty reply");
  }

  const parsed = parseDoubaoJsonPayload(replyBlock);
  if (parsed) {
    return parsed;
  }

  console.warn("callDoubao: JSON parse failed, falling back to plain text only");
  return {
    reply: sanitizeReplyParagraph(replyBlock),
  };
}
