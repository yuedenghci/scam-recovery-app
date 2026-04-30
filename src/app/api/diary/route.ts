import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import {
  getNaturalDayKey,
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
    const todayKey = getNaturalDayKey();

    const [today, recent] = await Promise.all([
      prisma.diaryEntry.findUnique({
        where: { userId_entryDay: { userId, entryDay: todayKey } },
      }),
      prisma.diaryEntry.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 7,
      }),
    ]);

    return Response.json({
      ok: true,
      todayEntry: today
        ? {
            id: today.id,
            content: today.content,
            entryDay: today.entryDay,
            createdAt: today.createdAt,
            updatedAt: today.updatedAt,
          }
        : null,
      recentEntries: recent.map((r) => ({
        id: r.id,
        entryDay: r.entryDay,
        contentPreview: r.content.slice(0, 120),
        createdAt: r.createdAt,
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

    const todayKey = getNaturalDayKey();
    const existing = await prisma.diaryEntry.findUnique({
      where: { userId_entryDay: { userId, entryDay: todayKey } },
    });

    let entry;
    let firstSaveToday = false;
    if (existing) {
      entry = await prisma.diaryEntry.update({
        where: { id: existing.id },
        data: { content },
      });
    } else {
      entry = await prisma.diaryEntry.create({
        data: { userId, content, entryDay: todayKey },
      });
      firstSaveToday = true;
    }

    if (firstSaveToday) {
      await recordProgressEvent({
        userId,
        eventType: RECOVERY_EVENT_TYPES.DIARY,
        scoreDelta: 2,
        sourceId: entry.id,
        dedupeByDay: true,
      });
      after(async () => {
        try {
          await recomputeRecoveryProgressState(userId);
          await maybeGenerateProgressLetter(userId);
        } catch (err) {
          console.error("diary recovery follow-up:", err);
        }
      });
    }

    return Response.json({
      ok: true,
      firstSaveToday,
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
