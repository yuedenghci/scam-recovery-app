import OpenAI from "openai";

import type { RightPanelKey } from "./onboardingFlow";
import {
  getModuleTitle,
  getQuestionById,
  questionTargetsProactiveLevel,
} from "./onboardingFlow";

export type ProactivePreferenceLevel = "passive" | "moderate" | "active";

export type OnboardingSummaryResult = {
  /** 左侧聊天气泡中展示的总结 */
  chatSummary: string;
  /** 用于合并进右侧该模块的要点行（会转成 - 行） */
  bullets: string[];
  /** 仅「主动程度」模块题目：模型推断的结构化档位 */
  proactivePreference?: ProactivePreferenceLevel;
};

const SYSTEM_BASE = `你是陪伴诈骗受害者的支持 AI 的「onboarding 整理员」，职责是把用户在某一题里说的话，整理成能写入该用户个人支持档案的简短记录。

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

const PROACTIVE_EXTRA = `
本题属于「你希望我的主动程度是怎样的」模块。除 chatSummary 与 bullets 外，你必须根据用户回答再输出字段 proactivePreference，取值只能是英文小写字符串之一：passive、moderate、active（不要引号包裹以外的多余文字）。
含义：passive=只在用户找来时回应、不要主动开启话题；moderate=偶尔轻轻主动关心；active=可以更主动先开启话题。
JSON 格式严格为：{"chatSummary":"...","bullets":["..."],"proactivePreference":"passive"|"moderate"|"active"}`;

function systemForQuestion(questionId: string): string {
  return questionTargetsProactiveLevel(questionId)
    ? `${SYSTEM_BASE}\n${PROACTIVE_EXTRA}`
    : SYSTEM_BASE;
}

function fallbackSummary(
  userAnswer: string,
  opts?: { includeProactivePreference?: boolean },
): OnboardingSummaryResult {
  const compact = userAnswer.replace(/\s+/g, " ").trim();
  if (!compact) {
    return {
      chatSummary: "我先把这一题记成：描述还比较少，你之后有想法我们再慢慢补。",
      bullets: ["目前细节较少，可后续补充"],
      ...(opts?.includeProactivePreference
        ? { proactivePreference: "moderate" as const }
        : {}),
    };
  }
  const short =
    compact.length > 90 ? `${compact.slice(0, 89).trim()}…` : compact;
  return {
    chatSummary: `嗯，我大概明白你刚刚在说的感觉了。\n我先记一下：${short}\n之后你想微调，我们再一起改。`,
    bullets: [short],
    ...(opts?.includeProactivePreference
      ? { proactivePreference: "moderate" as const }
      : {}),
  };
}

const VALID_PROACTIVE = new Set(["passive", "moderate", "active"]);

function parseProactivePreference(
  raw: unknown,
): ProactivePreferenceLevel | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  if (VALID_PROACTIVE.has(v)) return v as ProactivePreferenceLevel;
  return undefined;
}

export function parseJsonPayload(
  raw: string,
  opts?: { expectProactivePreference?: boolean },
): OnboardingSummaryResult | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]) as {
      chatSummary?: unknown;
      bullets?: unknown;
      proactivePreference?: unknown;
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
    const proactivePreference = opts?.expectProactivePreference
      ? parseProactivePreference(obj.proactivePreference) ?? "moderate"
      : parseProactivePreference(obj.proactivePreference);
    const base: OnboardingSummaryResult = {
      chatSummary,
      bullets: bullets.slice(0, 5),
    };
    if (proactivePreference) {
      base.proactivePreference = proactivePreference;
    }
    return base;
  } catch {
    return null;
  }
}

/**
 * Best-effort parse of the `chatSummary` string value from a streaming JSON body
 * (handles incomplete JSON and common escape sequences inside the string).
 */
export function extractPartialChatSummary(raw: string): string {
  const key = '"chatSummary"';
  const idx = raw.indexOf(key);
  if (idx < 0) return "";
  const afterKey = raw.slice(idx + key.length);
  const colon = afterKey.indexOf(":");
  if (colon < 0) return "";
  let rest = afterKey.slice(colon + 1).trimStart();
  if (!rest.startsWith('"')) return "";
  rest = rest.slice(1);
  let out = "";
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "\\") {
      if (i + 1 >= rest.length) break;
      const n = rest[i + 1];
      if (n === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (n === "r") {
        out += "\r";
        i++;
        continue;
      }
      if (n === "t") {
        out += "\t";
        i++;
        continue;
      }
      if (n === '"' || n === "\\" || n === "/") {
        out += n;
        i++;
        continue;
      }
      if (n === "u" && rest.length >= i + 6) {
        const hex = rest.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
          continue;
        }
      }
      out += n;
      i++;
      continue;
    }
    if (c === '"') break;
    out += c;
  }
  return out;
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
  const wantProactive = questionTargetsProactiveLevel(input.questionId);
  if (!q) {
    return fallbackSummary(input.userAnswer, {
      includeProactivePreference: wantProactive,
    });
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
      { role: "system", content: systemForQuestion(input.questionId) },
      { role: "user", content: userBlock },
    ],
    temperature: 0.35,
    max_tokens: 400,
  });

  const reply = completion.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    return fallbackSummary(input.userAnswer, {
      includeProactivePreference: wantProactive,
    });
  }
  const parsed = parseJsonPayload(reply, {
    expectProactivePreference: wantProactive,
  });
  if (parsed) return parsed;
  return fallbackSummary(input.userAnswer, {
    includeProactivePreference: wantProactive,
  });
}

export type OnboardingSummaryStreamHandlers = {
  /** Incremental visible chatSummary text (delta slices), same concatenation as main chat SSE */
  onSummaryDelta: (delta: string) => void;
};

/**
 * Stream model output; emits deltas derived from {@link extractPartialChatSummary}.
 * Returns the same structured result as {@link callOnboardingSummary} (authoritative after stream ends).
 */
export async function streamCallOnboardingSummary(
  input: {
    questionId: string;
    userAnswer: string;
    previousChatSummary?: string;
  },
  handlers: OnboardingSummaryStreamHandlers,
): Promise<OnboardingSummaryResult> {
  const q = getQuestionById(input.questionId);
  const wantProactive = questionTargetsProactiveLevel(input.questionId);
  if (!q) {
    const fb = fallbackSummary(input.userAnswer, {
      includeProactivePreference: wantProactive,
    });
    handlers.onSummaryDelta(fb.chatSummary);
    return fb;
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
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemForQuestion(input.questionId) },
      { role: "user", content: userBlock },
    ],
    temperature: 0.35,
    max_tokens: 400,
    stream: true,
  });

  let accumulated = "";
  let lastPartial = "";
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content ?? "";
    if (!delta) continue;
    accumulated += delta;
    const partial = extractPartialChatSummary(accumulated);
    if (partial.length > lastPartial.length) {
      handlers.onSummaryDelta(partial.slice(lastPartial.length));
      lastPartial = partial;
    }
  }

  const parsed = parseJsonPayload(accumulated, {
    expectProactivePreference: wantProactive,
  });
  if (parsed) return parsed;
  const fb = fallbackSummary(input.userAnswer, {
    includeProactivePreference: wantProactive,
  });
  if (fb.chatSummary.length > lastPartial.length) {
    handlers.onSummaryDelta(fb.chatSummary.slice(lastPartial.length));
  }
  return fb;
}
