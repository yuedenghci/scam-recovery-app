import OpenAI from "openai";

import type { RightPanelKey } from "./onboardingFlow";
import { getModuleTitle, getQuestionById } from "./onboardingFlow";

export type OnboardingSummaryResult = {
  /** 左侧聊天气泡中展示的总结 */
  chatSummary: string;
  /** 用于合并进右侧该模块的要点行（会转成 - 行） */
  bullets: string[];
};

const SYSTEM = `你是陪伴诈骗受害者的支持 AI 的「onboarding 整理员」，职责是把用户在某一题里说的话，整理成能写入该用户个人支持档案的简短记录。

要求：
- 全中文、语气温柔、不评判。
- 输出要简洁，适合放进侧边栏，不要写空话、不要长段落。
- 如果用户只说了很少、很模糊，也尽量用温和、不过度猜测的方式收束成 1~2 条要点；不要编造用户没表达过的具体事实。
- 只输出一个 JSON 对象，不要有其它文字。格式严格为：{"chatSummary":"...","bullets":["...","..."]}
- chatSummary：2~4 行以内，会显示在聊天里给用户确认。写法要像在和用户交流：
  1) 先自然回应用户刚说的话。
  2) 再顺势说“我把这些记录一下……”之类的话语，并给出你整理出的内容。
  3) 避免一上来就是生硬总结，避免机械句式（如反复“你提到…”）。
- chatSummary 整体要有陪伴感、口语感，不要客服腔，不要公文腔。
- bullets：2~4 条短句，每条是独立要点，会写入档案列表；不要重复 chatSummary 的全文。`;

function fallbackSummary(userAnswer: string): OnboardingSummaryResult {
  const compact = userAnswer.replace(/\s+/g, " ").trim();
  if (!compact) {
    return {
      chatSummary: "我先把这一题记成：描述还比较少，你之后有想法我们再慢慢补。",
      bullets: ["目前细节较少，可后续补充"],
    };
  }
  const short =
    compact.length > 90 ? `${compact.slice(0, 89).trim()}…` : compact;
  return {
    chatSummary: `嗯，我大概明白你刚刚在说的感觉了。\n我先记一下：${short}\n之后你想微调，我们再一起改。`,
    bullets: [short],
  };
}

function parseJsonPayload(raw: string): OnboardingSummaryResult | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]) as {
      chatSummary?: unknown;
      bullets?: unknown;
    };
    const chatSummary =
      typeof obj.chatSummary === "string" ? obj.chatSummary.trim() : "";
    if (!chatSummary) return null;
    let bullets: string[] = [];
    if (Array.isArray(obj.bullets)) {
      bullets = obj.bullets
        .map((b) => (typeof b === "string" ? b.trim() : String(b).trim()))
        .filter(Boolean);
    }
    if (bullets.length === 0) {
      const lines = chatSummary
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
      bullets = lines.slice(0, 3);
    }
    return { chatSummary, bullets: bullets.slice(0, 5) };
  } catch {
    return null;
  }
}

/**
 * 调用 LLM 生成 onboarding 一题的总结。
 * onboarding summary 只使用 ARK_ONBOARDING_MODEL，不与 support chat 的 ARK_MODEL 混用。
 */
export async function callOnboardingSummary(input: {
  questionId: string;
  userAnswer: string;
  previousChatSummary?: string;
}): Promise<OnboardingSummaryResult> {
  const q = getQuestionById(input.questionId);
  if (!q) {
    return fallbackSummary(input.userAnswer);
  }
  const moduleTitle = getModuleTitle(q.rightPanelKey as RightPanelKey);
  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_ONBOARDING_MODEL;
  if (!model) {
    throw new Error("Missing ARK_ONBOARDING_MODEL for onboarding summary");
  }
  if (!apiKey || !baseURL) {
    throw new Error("Missing ARK_API_KEY or ARK_BASE_URL for onboarding summary");
  }

  const userBlock = [
    `题目所在模块：${moduleTitle}（问题 id：${q.id}）`,
    `原题提示：\n${q.prompt}`,
    `用户本题的原始回答：\n${input.userAnswer.trim() || "（空）"}`,
    input.previousChatSummary
      ? `这一题上一次的整理（供你参考修改）：\n${input.previousChatSummary}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const client = new OpenAI({ apiKey, baseURL: baseURL as string });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: userBlock },
    ],
    temperature: 0.35,
    max_tokens: 400,
  });

  const reply = completion.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return fallbackSummary(input.userAnswer);
  }
  const parsed = parseJsonPayload(reply);
  if (parsed) return parsed;
  return fallbackSummary(input.userAnswer);
}
