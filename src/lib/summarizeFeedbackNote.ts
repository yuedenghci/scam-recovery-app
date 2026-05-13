import OpenAI from "openai";

type SummarizeFeedbackNoteInput = {
  feedbackSource: "panel" | "explicit_text";
  selectedReason?: string | null;
  otherText?: string | null;
  userMessage?: string | null;
  assistantReplyText?: string | null;
  currentStateSnapshot?: string | null;
};

function formatNonEmpty(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

export async function summarizeFeedbackNote(
  input: SummarizeFeedbackNoteInput
): Promise<string> {
  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL;

  const missing: string[] = [];
  if (!apiKey) missing.push("ARK_API_KEY");
  if (!baseURL) missing.push("ARK_BASE_URL");
  if (!model) missing.push("ARK_MODEL");
  if (missing.length > 0) {
    console.error(
      `Skipped feedback note summarization due to missing env vars: ${missing.join(", ")}`
    );
    return "";
  }
  const modelName = model as string;

  const sourceLabel =
    input.feedbackSource === "panel" ? "反馈面板反馈" : "文字明确反馈";

  const prompt = formatNonEmpty([
    `反馈来源：${sourceLabel}`,
    input.selectedReason ? `选择原因：${input.selectedReason}` : null,
    input.otherText ? `补充内容：${input.otherText}` : null,
    input.userMessage ? `用户反馈原文：${input.userMessage}` : null,
    input.assistantReplyText
      ? `被反馈的助手回复：${input.assistantReplyText}`
      : null,
    input.currentStateSnapshot ? `状态快照：${input.currentStateSnapshot}` : null,
    "",
    "请用中文写一条简短反馈总结，覆盖三点：",
    "1) 什么地方没有起作用",
    "2) 相关上下文",
    "3) 下一次可能更有效的做法",
    "要求：具体、可执行、避免空话。",
  ]);

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const completion = await client.chat.completions.create({
    model: modelName,
    messages: [
      {
        role: "system",
        content:
          "你是一个对话反馈分析助手。你的任务是把用户反馈整理成可供下一轮回复使用的简洁中文说明。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.2,
    max_tokens: 180,
  });

  return completion.choices?.[0]?.message?.content?.trim() ?? "";
}
