import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import {
  filterProgressLettersForDisplay,
  getEarliestProgressTraceAt,
  recomputeRecoveryProgressState,
} from "@/lib/recoveryProgress";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法加载进展" },
        { status: 401 },
      );
    }
    const state = await recomputeRecoveryProgressState(userId);
    const earliestTrace = await getEarliestProgressTraceAt(userId);
    const rawLetters = await prisma.progressLetter.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
        periodStart: true,
        periodEnd: true,
      },
    });
    const letters = filterProgressLettersForDisplay(rawLetters, earliestTrace);
    const hasUnreadLetters = letters.some((l) => !l.isRead);

    return Response.json({
      ok: true,
      stage: state.currentStage,
      hasUnreadLetters,
      letters,
    });
  } catch (error) {
    console.error("progress GET:", error);
    return Response.json(
      {
        ok: false,
        error: "加载恢复进展失败",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
