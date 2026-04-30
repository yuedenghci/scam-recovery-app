import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { callProgressLetterLLM } from "@/lib/callProgressLetterLLM";

type DbLike = PrismaClient | Prisma.TransactionClient;

//const LETTER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const LETTER_INTERVAL_MS = 1 * 60 * 1000;
const LETTER_LOOKBACK_DAYS = 7;


/** Earliest recovery progress trace (any recovery-progress event). */
export async function getEarliestProgressTraceAt(
  userId: string,
  db: DbLike = prisma
): Promise<Date | null> {
  const agg = await db.recoveryProgressEvent.aggregate({
    where: { userId },
    _min: { createdAt: true },
  });
  return agg._min.createdAt;
}

/**
 * Letters created before this time could not have been generated under the
 * “first letter after one week from first trace” rule; hide them in the UI (e.g. old test rows).
 */
export function getFirstProgressLetterEligibleAt(
  earliestTrace: Date | null
): Date | null {
  if (!earliestTrace) return null;
  return new Date(earliestTrace.getTime() + LETTER_INTERVAL_MS);
}

export function filterProgressLettersForDisplay<
  T extends { createdAt: Date },
>(letters: T[], earliestTrace: Date | null): T[] {
  const eligibleAt = getFirstProgressLetterEligibleAt(earliestTrace);
  if (!eligibleAt) return letters;
  return letters.filter((l) => l.createdAt >= eligibleAt);
}

export const RECOVERY_EVENT_TYPES = {
  CHECKIN: "checkin",
  TINY_STEP_DONE: "tiny_step_done",
  TINY_STEP_PARTIAL: "tiny_step_partial",
  DIARY: "diary",
  LEARNING: "learning",
} as const;

export function getNaturalDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getNaturalDayStart(date: Date = new Date()): Date {
  return new Date(`${getNaturalDayKey(date)}T00:00:00`);
}

export function getStageFromScore(score: number): number {
  if (score >= 5) return 4;
  if (score >= 3) return 3;
  if (score >= 2) return 2;
  if (score >= 1) return 1;
  return 0;
}

export async function recomputeRecoveryProgressState(
  userId: string,
  db: DbLike = prisma
) {
  const sum = await db.recoveryProgressEvent.aggregate({
    where: { userId },
    _sum: { scoreDelta: true },
  });
  const totalScore = Math.max(0, sum._sum.scoreDelta ?? 0);
  const currentStage = getStageFromScore(totalScore);

  return db.recoveryProgressState.upsert({
    where: { userId },
    create: {
      userId,
      totalScore,
      currentStage,
    },
    update: {
      totalScore,
      currentStage,
    },
  });
}

export async function recordProgressEvent(params: {
  userId: string;
  eventType: string;
  scoreDelta: number;
  eventDate?: Date;
  sourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  dedupeByDay?: boolean;
}) {
  const eventDate = params.eventDate ?? new Date();
  const eventDay = getNaturalDayKey(eventDate);

  if (params.dedupeByDay) {
    const existing = await prisma.recoveryProgressEvent.findFirst({
      where: {
        userId: params.userId,
        eventType: params.eventType,
        eventDay,
      },
      select: { id: true },
    });
    if (existing) return { created: false as const, eventId: existing.id };
  }

  if (params.sourceId) {
    const existingBySource = await prisma.recoveryProgressEvent.findFirst({
      where: {
        userId: params.userId,
        eventType: params.eventType,
        sourceId: params.sourceId,
      },
      select: { id: true },
    });
    if (existingBySource) {
      return { created: false as const, eventId: existingBySource.id };
    }
  }

  const created = await prisma.recoveryProgressEvent.create({
    data: {
      userId: params.userId,
      eventType: params.eventType,
      scoreDelta: params.scoreDelta,
      eventDate,
      eventDay,
      sourceId: params.sourceId ?? null,
      metadata: params.metadata,
    },
  });
  return { created: true as const, eventId: created.id };
}

function compactText(text: string | null | undefined, max = 180): string {
  if (!text) return "";
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trim()}…`;
}

async function buildRecentProgressContext(userId: string, now = new Date()) {
  const periodEnd = now;
  const periodStart = new Date(
    periodEnd.getTime() - LETTER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const [events, checkins, statuses, diaryEntries] = await Promise.all([
    prisma.recoveryProgressEvent.findMany({
      where: { userId, eventDate: { gte: periodStart, lte: periodEnd } },
      orderBy: { eventDate: "desc" },
      take: 200,
    }),
    prisma.currentState.findMany({
      where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.dailyRecoveryStatusLog.findMany({
      where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
      include: {
        task: {
          select: {
            recoveryDomain: true,
            currentTaskText: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
    prisma.diaryEntry.findMany({
      where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const counts = {
    checkin: events.filter((e) => e.eventType === RECOVERY_EVENT_TYPES.CHECKIN).length,
    tinyStepDone: events.filter(
      (e) => e.eventType === RECOVERY_EVENT_TYPES.TINY_STEP_DONE
    ).length,
    tinyStepPartial: events.filter(
      (e) => e.eventType === RECOVERY_EVENT_TYPES.TINY_STEP_PARTIAL
    ).length,
    diary: events.filter((e) => e.eventType === RECOVERY_EVENT_TYPES.DIARY).length,
  };

  const recentCheckins = checkins.slice(0, 8).map((c) => ({
    emotional: c.emotional,
    physical: c.physical,
    spatial: c.spatial,
    createdAt: c.createdAt.toISOString(),
  }));

  const recentTinySteps = statuses.slice(0, 12).map((s) => ({
    taskText: compactText(s.task.currentTaskText, 160) || null,
    recoveryDomain: s.task.recoveryDomain,
    status: s.status as "done" | "partial" | "skipped",
    createdAt: s.createdAt.toISOString(),
  }));

  const recentDiaryEntries = diaryEntries.slice(0, 5).map((d) => ({
    content: compactText(d.content, 280),
    createdAt: d.createdAt.toISOString(),
  }));

  return {
    periodStart,
    periodEnd,
    context: {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      counts,
      recentCheckins,
      recentTinySteps,
      recentDiaryEntries,
    },
  };
}

export async function maybeGenerateProgressLetter(userId: string) {
  const now = new Date();

  const [letterCount, earliestTrace, state] = await Promise.all([
    prisma.progressLetter.count({ where: { userId } }),
    getEarliestProgressTraceAt(userId),
    prisma.recoveryProgressState.findUnique({ where: { userId } }),
  ]);

  if (!earliestTrace) {
    return null;
  }

  if (letterCount === 0) {
    if (now.getTime() - earliestTrace.getTime() < LETTER_INTERVAL_MS) {
      return null;
    }
  } else {
    let lastGen = state?.lastLetterGeneratedAt ?? null;
    if (!lastGen) {
      const latest = await prisma.progressLetter.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      lastGen = latest?.createdAt ?? null;
    }
    if (!lastGen || now.getTime() - lastGen.getTime() < LETTER_INTERVAL_MS) {
      return null;
    }
  }

  const { periodStart, periodEnd, context } = await buildRecentProgressContext(userId, now);
  const llmResult = await callProgressLetterLLM(context);

  return prisma.$transaction(async (tx) => {
    const [freshLetterCount, freshEarliest, freshState] = await Promise.all([
      tx.progressLetter.count({ where: { userId } }),
      getEarliestProgressTraceAt(userId, tx),
      tx.recoveryProgressState.findUnique({
        where: { userId },
        select: { lastLetterGeneratedAt: true },
      }),
    ]);

    if (!freshEarliest) {
      return null;
    }

    if (freshLetterCount === 0) {
      if (now.getTime() - freshEarliest.getTime() < LETTER_INTERVAL_MS) {
        return null;
      }
    } else {
      let lastGen = freshState?.lastLetterGeneratedAt ?? null;
      if (!lastGen) {
        const latest = await tx.progressLetter.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        lastGen = latest?.createdAt ?? null;
      }
      if (!lastGen || now.getTime() - lastGen.getTime() < LETTER_INTERVAL_MS) {
        return null;
      }
    }

    const letter = await tx.progressLetter.create({
      data: {
        userId,
        periodStart,
        periodEnd,
        title: llmResult.title,
        body: llmResult.body,
        context,
      },
    });

    await tx.recoveryProgressState.upsert({
      where: { userId },
      create: {
        userId,
        totalScore: 0,
        currentStage: 0,
        lastLetterGeneratedAt: now,
      },
      update: {
        lastLetterGeneratedAt: now,
      },
    });

    return letter;
  });
}
