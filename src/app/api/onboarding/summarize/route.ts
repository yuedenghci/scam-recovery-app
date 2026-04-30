import { callOnboardingSummary } from "@/lib/callOnboardingSummary";
import { getQuestionById } from "@/lib/onboardingFlow";

export async function POST(request: Request) {
  const routeStartMs = Date.now();
  const onboardingModel = process.env.ARK_ONBOARDING_MODEL ?? "";
  console.log("[onboarding/summarize] start");
  console.log(
    "[onboarding/summarize] model:",
    onboardingModel || "(missing ARK_ONBOARDING_MODEL)"
  );

  try {
    const body = (await request.json()) as {
      questionId?: string;
      userAnswer?: string;
      previousChatSummary?: string;
    };

    const questionId =
      typeof body.questionId === "string" ? body.questionId.trim() : "";
    const userAnswer =
      typeof body.userAnswer === "string" ? body.userAnswer : "";
    const previousChatSummary =
      typeof body.previousChatSummary === "string" &&
      body.previousChatSummary.trim()
        ? body.previousChatSummary.trim()
        : undefined;

    if (!questionId || !getQuestionById(questionId)) {
      return Response.json(
        { ok: false, error: "Invalid questionId" },
        { status: 400 }
      );
    }

    console.log(
      "[onboarding/summarize] before model call at:",
      new Date().toISOString()
    );
    const modelCallStartMs = Date.now();
    const result = await callOnboardingSummary({
      questionId,
      userAnswer,
      previousChatSummary,
    });
    console.log(
      "[onboarding/summarize] model call ms:",
      Date.now() - modelCallStartMs
    );

    return Response.json({
      ok: true,
      chatSummary: result.chatSummary,
      bullets: result.bullets,
    });
  } catch (e) {
    console.error("onboarding summarize error:", e);
    return Response.json(
      {
        ok: false,
        error: "Summary failed",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    console.log("[onboarding/summarize] total ms:", Date.now() - routeStartMs);
  }
}
