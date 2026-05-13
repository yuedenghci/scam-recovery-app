import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { getShanghaiDayKey } from "@/lib/dayKey";
import {
  maybeGenerateProgressLetter,
  recomputeRecoveryProgressState,
  recordProgressEvent,
  RECOVERY_EVENT_TYPES,
} from "@/lib/recoveryProgress";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法读取日记" },
        { status: 401 },
      );
    }

    const entries = await prisma.diaryEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        content: true,
        entryDay: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return Response.json({
      ok: true,
      entries: entries.map((r) => ({
        id: r.id,
        content: r.content,
        entryDay: r.entryDay,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error("diary GET:", error);
    return Response.json(
      {
        ok: false,
        error: "加载日记失败",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法保存日记" },
        { status: 401 },
      );
    }
    const body = (await request.json()) as { content?: unknown };
    const content = asString(body.content).trim();
    if (!content) {
      return Response.json({ ok: false, error: "日记内容不能为空" }, { status: 400 });
    }

    const todayKey = getShanghaiDayKey();

    const entry = await prisma.diaryEntry.create({
      data: { userId, content, entryDay: todayKey },
    });

    const progressResult = await recordProgressEvent({
      userId,
      eventType: RECOVERY_EVENT_TYPES.DIARY,
      scoreDelta: 2,
      sourceId: entry.id,
      dedupeByDay: true,
    });

    after(async () => {
      try {
        await recomputeRecoveryProgressState(userId);
        if (progressResult.created) {
          await maybeGenerateProgressLetter(userId);
        }
      } catch (err) {
        console.error("diary recovery follow-up:", err);
      }
    });

    return Response.json({
      ok: true,
      diaryProgressApplied: progressResult.created,
      diary: {
        id: entry.id,
        content: entry.content,
        entryDay: entry.entryDay,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      },
    });
  } catch (error) {
    console.error("diary POST:", error);
    return Response.json(
      {
        ok: false,
        error: "保存日记失败",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
