import OpenAI from "openai";

type ProgressLetterContext = {
  periodStart: string;
  periodEnd: string;
  counts: {
    checkin: number;
    tinyStepDone: number;
    tinyStepPartial: number;
    diary: number;
  };
  recentCheckins: Array<{
    emotional: string | null;
    physical: string | null;
    spatial: string | null;
    createdAt: string;
  }>;
  recentTinySteps: Array<{
    taskText: string | null;
    recoveryDomain: string;
    status: "done" | "partial" | "skipped";
    createdAt: string;
  }>;
  recentDiaryEntries: Array<{
    content: string;
    createdAt: string;
  }>;
};

export type ProgressLetterResult = {
  title: string;
  body: string;
};

function safeTrim(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1).trim()}…`;
}

function fallbackLetter(context: ProgressLetterContext): ProgressLetterResult {
  const hasDiary = context.counts.diary > 0;
  const hasSteps = context.counts.tinyStepDone + context.counts.tinyStepPartial > 0;
  const hasCheckin = context.counts.checkin > 0;

  const paragraphs: string[] = [];
  paragraphs.push("亲爱的你：");

  if (hasCheckin) {
    paragraphs.push("这段时间，你愿意把注意力放回自己身上。有些时候，只是把当下说出来，就已经很不容易了。");
  }
  if (hasSteps) {
    paragraphs.push("你也做过一些很小、但确实算数的事。它们不需要轰轰烈烈，只要你愿意继续，把一天往前挪一点点就好。");
  }
  if (hasDiary) {
    paragraphs.push("你把心里的片段写了下来。你没有急着把它们放走，而是给了它们一个安静停留的地方。");
  }
  if (!hasCheckin && !hasSteps && !hasDiary) {
    paragraphs.push("就算这周看起来什么都不多，你仍然能停下来，和自己待一会儿。那也是一种照顾。");
  }

  paragraphs.push("如果今天的你有点疲惫，也别急着证明什么。把下一步留到你愿意的时候，再慢慢来。");
  paragraphs.push("小蝴蝶会在这儿，陪你把生活一点点接回自己手里。");

  return {
    title: "给这段时间的你",
    body: paragraphs.join("\n\n"),
  };
}

export async function callProgressLetterLLM(
  context: ProgressLetterContext
): Promise<ProgressLetterResult> {
  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model = process.env.ARK_MODEL;
  if (!apiKey || !baseURL || !model) {
    return fallbackLetter(context);
  }

  const client = new OpenAI({ apiKey, baseURL });

  const prompt = [
    "你将收到一段近7天的恢复相关上下文。请把它写成一封温暖的中文信，像手写的那种。",
    "结构要求：先一句称呼（如“亲爱的你”：）；正文 1-3 段，结尾有落款（“小蝴蝶”）",
    "内容重点：只需要看见与承认用户做过的“小动作”（来自 check-in、小步、日记），数字/结构信息只是背景，不要写成报告或复盘。",
    "语气要求：不说教、不官方、不夸张赞美、不绩效口吻，保持自然共情。",
    "禁止：虚构细节；把它写成总结/复盘/教学；机械罗列指标。",
    "允许：可以自然地提到上下文中的具体片段（必须来自给定内容）。",
    "输出必须是 JSON：{\"title\":\"...\",\"body\":\"...\"}。",
    "title 8-18字；body 120-900字；正文里允许用换行来分段（用\\n或\\n\\n）。",
    "",
    JSON.stringify(context),
  ].join("\n");

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.45,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "你是一个把心意写成信的人。你写的不是报告，而是一封给用户的温柔书信。",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallbackLetter(context);

    const parsed = JSON.parse(raw) as Partial<ProgressLetterResult>;
    const title = safeTrim(String(parsed.title ?? ""), 30);
    const body = safeTrim(String(parsed.body ?? ""), 1000);
    if (!title || !body) return fallbackLetter(context);
    return { title, body };
  } catch {
    return fallbackLetter(context);
  }
}
