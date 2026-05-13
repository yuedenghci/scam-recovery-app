import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { getShanghaiDayKey } from "@/lib/dayKey";
import {
  maybeGenerateProgressLetter,
  recomputeRecoveryProgressState,
  recordProgressEvent,
  RECOVERY_EVENT_TYPES,
} from "@/lib/recoveryProgress";

/** Optional string from JSON: null when missing or empty. */
function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = typeof value === "string" ? value : String(value)
  return s === "" ? null : s
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json({ ok: true, currentState: null, isToday: false });
    }
    const row = await prisma.currentState.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    })

    if (!row) {
      return Response.json({
        ok: true,
        currentState: null,
        isToday: false,
      });
    }

    const isToday =
      getShanghaiDayKey(row.createdAt) === getShanghaiDayKey(new Date());

    return Response.json({
      ok: true,
      currentState: {
        emotional: row.emotional,
        physical: row.physical,
        spatial: row.spatial,
        createdAt: row.createdAt,
      },
      isToday,
    })
  } catch (error) {
    console.error("Failed to process current state (GET):", error)
    return Response.json(
      {
        ok: false,
        error: "Failed to process current state",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法保存当前状态" },
        { status: 401 },
      );
    }
    const body = await request.json();

    const savedCurrentState = await prisma.currentState.create({
      data: {
        userId,
        emotional: optionalString(body.emotional),
        physical: optionalString(body.physical),
        spatial: optionalString(body.spatial),
      },
    });

    console.log("Saved current state:", savedCurrentState);

    const response = Response.json({ ok: true, message: "Current state saved" });

    const stateId = savedCurrentState.id;
    void (async () => {
      try {
        const eventResult = await recordProgressEvent({
          userId,
          eventType: RECOVERY_EVENT_TYPES.CHECKIN,
          scoreDelta: 1,
          sourceId: stateId,
          dedupeByDay: true,
        });

        if (eventResult.created) {
          await recomputeRecoveryProgressState(userId);
          await maybeGenerateProgressLetter(userId);
        }
      } catch (e) {
        console.error("current-state background progress failed:", e);
      }
    })();

    return response;
  } catch (error) {
    console.error("Failed to process current state (POST):", error)
    return Response.json(
      {
        ok: false,
        error: "Failed to process current state",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
