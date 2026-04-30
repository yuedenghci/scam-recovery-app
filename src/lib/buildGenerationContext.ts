import type { UserSupportContext } from "@prisma/client";

import { DF1_SYSTEM_PROMPT } from "./df1Prompt";
import { buildSupportSystemPrompt } from "./buildSupportSystemPrompt";

export function buildGenerationContext(
  supportContext: UserSupportContext | null,
  currentState:
    | {
        emotional: string | null;
        physical: string | null;
        spatial: string | null;
      }
    | null,
  latestUserMessage: string,
  panelFeedbackNotes: string[],
  explicitFeedbackNotes: string[],
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>
) {
  return {
    systemPrompt: buildSupportSystemPrompt({
      basePrompt: DF1_SYSTEM_PROMPT,
      supportContext,
    }),
    currentState: currentState
      ? {
          emotional: currentState.emotional,
          physical: currentState.physical,
          spatial: currentState.spatial,
        }
      : null,
    panelFeedbackNotes,
    explicitFeedbackNotes,
    chatHistory,
    latestUserMessage,
  };
}
