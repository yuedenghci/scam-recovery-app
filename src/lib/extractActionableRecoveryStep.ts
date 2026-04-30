import OpenAI from "openai";

export async function extractActionableRecoveryStep(args: {
  replyText: string;
}): Promise<{
  hasActionableRecoveryStep: boolean;
  suggestedAction: string | null;
  reason: string;
}> {
  const replyText = args.replyText.trim();
  if (!replyText) {
    return {
      hasActionableRecoveryStep: false,
      suggestedAction: null,
      reason: "reply 为空",
    };
  }

  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL;
  if (!apiKey || !baseURL || !model) {
    return {
      hasActionableRecoveryStep: false,
      suggestedAction: null,
      reason: "缺少模型环境变量",
    };
  }

  const client = new OpenAI({ apiKey, baseURL });

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 140,
      messages: [
        {
          role: "system",
          content:
            '你是严格提取器。你的任务是从“助手回复正文”里找出是否存在一个可直接变成“日常恢复”小步任务的具体动作短语。只输出严格 JSON，且只能包含三个键：{"hasActionableRecoveryStep": boolean, "suggestedAction": string | null, "reason": string}。\n' +
            '规则：\n' +
            '- 只有当回复中确实出现了一段“可执行、具体、很小、低压力”的中文动作短语时，才令 hasActionableRecoveryStep=true。\n' +
            '- suggestedAction 字符串尽量短（不要超过 35 个字），并且必须是“身体/环境/微小动作”，不要使用抽象陪伴句。\n' +
            '- 否则令 hasActionableRecoveryStep=false，并且 suggestedAction 必须为 null。\n' +
            '- reason 用简短中文说明理由，不要输出其它文本。',
        },
        {
          role: "user",
          content: replyText,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      return {
        hasActionableRecoveryStep: false,
        suggestedAction: null,
        reason: "模型未返回内容",
      };
    }

    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed: unknown = JSON.parse(jsonText);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("hasActionableRecoveryStep" in parsed) ||
      !("suggestedAction" in parsed) ||
      !("reason" in parsed)
    ) {
      return {
        hasActionableRecoveryStep: false,
        suggestedAction: null,
        reason: "JSON 结构不符合预期",
      };
    }

    const p = parsed as {
      hasActionableRecoveryStep?: unknown;
      suggestedAction?: unknown;
      reason?: unknown;
    };

    const hasActionable =
      typeof p.hasActionableRecoveryStep === "boolean"
        ? p.hasActionableRecoveryStep
        : false;

    const reason =
      typeof p.reason === "string" ? p.reason.trim() : "reason 未提供";

    let suggestedAction =
      typeof p.suggestedAction === "string" ? p.suggestedAction.trim() : "";

    if (!suggestedAction || suggestedAction === "null" || suggestedAction === "无") {
      suggestedAction = "";
    }

    if (!hasActionable) {
      return {
        hasActionableRecoveryStep: false,
        suggestedAction: null,
        reason,
      };
    }

    // 轻量兜底：必须能在回复里找到原文片段。
    if (
      !suggestedAction ||
      suggestedAction.length > 120 ||
      !replyText.includes(suggestedAction)
    ) {
      return {
        hasActionableRecoveryStep: false,
        suggestedAction: null,
        reason: "抽取结果未在回复中以原文片段出现",
      };
    }

    return {
      hasActionableRecoveryStep: true,
      suggestedAction,
      reason,
    };
  } catch (e) {
    return {
      hasActionableRecoveryStep: false,
      suggestedAction: null,
      reason:
        e instanceof Error ? `抽取失败：${e.message}` : "抽取失败（未知错误）",
    };
  }
}

