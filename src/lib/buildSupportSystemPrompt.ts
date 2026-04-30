import type { UserSupportContext } from "@prisma/client";

import { formatUserSupportContextForSystemPrompt } from "./buildSupportContextPrompt";

export function buildSupportSystemPrompt(input: {
  basePrompt: string;
  supportContext: UserSupportContext | null;
}): string {
  const supplement = input.supportContext
    ? formatUserSupportContextForSystemPrompt({
        scamSituation: input.supportContext.scamSituation ?? "",
        scamImpact: input.supportContext.scamImpact ?? "",
        personality: input.supportContext.personality ?? "",
        likedActivities: input.supportContext.likedActivities ?? "",
        expectedRole: input.supportContext.expectedRole ?? "",
        toneStyle: input.supportContext.toneStyle ?? "",
        proactiveLevel: input.supportContext.proactiveLevel ?? "",
        helpGoals: input.supportContext.helpGoals ?? "",
      })
    : "【用户尚未填写 onboarding 支持设定，可根据对话自然了解其偏好与处境。】";

  return [input.basePrompt, "", "以下是这个用户已经整理出的支持设定：", supplement]
    .filter(Boolean)
    .join("\n");
}
