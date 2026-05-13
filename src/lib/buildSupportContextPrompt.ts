import type { RightPanelKey } from "./onboardingFlow";
import { RIGHT_PANEL_MODULES } from "./onboardingFlow";

export type UserSupportContextFields = {
  scamSituation: string;
  scamImpact: string;
  personality: string;
  likedActivities: string;
  expectedRole: string;
  toneStyle: string;
  proactiveLevel: string;
  helpGoals: string;
};

/**
 * 将 `UserSupportContext` 的 8 个模块拼成可注入正式 support 系统提示的块。
 * 正式 chat 应优先用此内容，而不是完整 onboarding 原文。
 */
export function formatUserSupportContextForSystemPrompt(
  c: UserSupportContextFields
): string {
  const lines: string[] = [
    "【用户 onboarding 时整理好的支持设定】",
  ];
  for (const m of RIGHT_PANEL_MODULES) {
    const text = (c[m.key] ?? "").replace(/\r\n/g, "\n").trim();
    if (text) {
      lines.push(`- ${m.title}：${text.replace(/\n/g, " ")}`);
    }
  }
  if (lines.length === 1) {
    return "【用户尚未填写 onboarding 支持设定，可根据对话自然了解其偏好与处境。】";
  }
  return lines.join("\n");
}

export function isRightPanelKey(k: string): k is RightPanelKey {
  return (RIGHT_PANEL_MODULES as { key: string }[]).some((m) => m.key === k);
}
