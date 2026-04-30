import OpenAI from "openai";

export async function detectExplicitFeedback(args: {
  userMessage: string;
  latestAssistantReplyText: string;
}): Promise<{ isExplicitFeedback: boolean; reason: string }> {
  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL;
  if (!apiKey || !baseURL || !model) {
    return { isExplicitFeedback: false, reason: "" };
  }

  const userMessage = args.userMessage.trim();
  const latestAssistantReplyText = args.latestAssistantReplyText.trim();
  if (!userMessage || !latestAssistantReplyText) {
    return { isExplicitFeedback: false, reason: "" };
  }

  const client = new OpenAI({ apiKey, baseURL });

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 160,
      messages: [
        {
          role: "system",
          content:
            '你是严格分类器。判断“用户最新消息”是否是在针对“上一条助手回复”给出明确反馈。明确反馈包括：不满、纠正、指出误解、要求回复方式变化（语气/结构/重点/长短等）。只输出严格 JSON，且只能有这两个键：{"isExplicitFeedback": boolean, "reason": string}。reason 必须是简短中文，不要输出任何额外文本。',
        },
        {
          role: "user",
          content: [
            "上一条助手回复：",
            latestAssistantReplyText,
            "",
            "用户最新消息：",
            userMessage,
          ].join("\n"),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) return { isExplicitFeedback: false, reason: "" };

    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed: unknown = JSON.parse(jsonText);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "isExplicitFeedback" in parsed &&
      "reason" in parsed &&
      typeof (parsed as { isExplicitFeedback: unknown }).isExplicitFeedback ===
        "boolean" &&
      typeof (parsed as { reason: unknown }).reason === "string"
    ) {
      return {
        isExplicitFeedback: (parsed as { isExplicitFeedback: boolean })
          .isExplicitFeedback,
        reason: (parsed as { reason: string }).reason.trim(),
      };
    }

    return { isExplicitFeedback: false, reason: "" };
  } catch {
    return { isExplicitFeedback: false, reason: "" };
  }
}
