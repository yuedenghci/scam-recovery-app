import OpenAI from "openai";

const VALID = new Set(["passive", "moderate", "active"]);

/**
 * 根据用户写在「主动程度」模块的自然语言，推断结构化 proactivePreference。
 * 用于右侧编辑 proactiveLevel 后与 DB 中的档位保持同步。
 */
export async function inferProactivePreferenceFromLevelText(
  proactiveLevelText: string,
): Promise<"passive" | "moderate" | "active"> {
  const trimmed = proactiveLevelText.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "passive";

  const apiKey = process.env.ARK_API_KEY;
  const baseURL = process.env.ARK_BASE_URL;
  const model =
    process.env.ARK_ONBOARDING_MODEL ?? process.env.ARK_MODEL;
  if (!apiKey || !baseURL || !model) {
    return "moderate";
  }

  const client = new OpenAI({ apiKey, baseURL });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "你是分类器。用户描述了希望 AI「多主动」陪伴的偏好。只输出一个小写英文单词：passive、moderate 或 active。不要其它文字。\n含义：passive=只在用户找来时回应、不要主动开启话题；moderate=偶尔轻轻主动关心；active=可以更主动一点先开启话题。",
      },
      {
        role: "user",
        content: `用户的主动程度设定（中文）：\n${trimmed}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 8,
  });

  const raw = completion.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
  const token = raw.split(/\s+/)[0]?.replace(/[^a-z]/g, "") ?? "";
  if (VALID.has(token)) {
    return token as "passive" | "moderate" | "active";
  }
  return "moderate";
}
