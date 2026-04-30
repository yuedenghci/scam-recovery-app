import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { generateDailyRecoveryCandidates } from "@/lib/generateDailyRecoveryCandidates";
import {
  maybeGenerateProgressLetter,
  recomputeRecoveryProgressState,
  recordProgressEvent,
  RECOVERY_EVENT_TYPES,
} from "@/lib/recoveryProgress";
const MAX_ACTIVE_TASKS = 3;

const ENCOURAGE_DONE = [
  "很好，你已经往前挪了一小步。",
  "能做起来这一步，真的很不容易。",
  "我在这里，和你一起看到你在照顾自己。",
] as const;

const ENCOURAGE_PARTIAL = [
  "做了一部分也很好，这样已经算数。",
  "不用一次做完，这样也已经很有帮助。",
  "你愿意尝试这一点，我觉得很温柔。",
] as const;

const HOLD_SKIPPED = [
  "没关系，今天这样也可以。",
  "今天没做也没关系，我们可以明天再看。",
  "先放一放也没关系，不说明什么。",
] as const;

function pickOne(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)] ?? messages[0];
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return String(value);
}

type PostBody = {
  action?: unknown;
  taskId?: unknown;
  recoveryDomain?: unknown;
  difficultyNote?: unknown;
  taskText?: unknown;
  status?: unknown;
  suggestion?: unknown;
  messageId?: unknown;
  reminderEnabled?: unknown;
  reminderTime?: unknown;
  continuationDays?: unknown;
  continuationReminderEnabled?: unknown;
  continuationReminderTime?: unknown;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法加载日常恢复" },
        { status: 401 },
      );
    }

    const [tasks, todayLogs, logCountGroups] = await Promise.all([
      prisma.dailyRecovery.findMany({
        where: {
          userId,
          isDeleted: false,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.dailyRecoveryStatusLog.findMany({
        where: {
          userId,
          createdAt: { gte: startOfToday() },
        },
        select: {
          dailyRecoveryId: true,
          status: true,
        },
      }),
      prisma.dailyRecoveryStatusLog.groupBy({
        by: ["dailyRecoveryId"],
        where: { userId },
        _count: { id: true },
      }),
    ]);

    const everLogCountMap = new Map<string, number>();
    for (const row of logCountGroups) {
      everLogCountMap.set(row.dailyRecoveryId, row._count.id);
    }

    const todayStatusMap = new Map<string, string>();
    for (const log of todayLogs) {
      if (!todayStatusMap.has(log.dailyRecoveryId)) {
        todayStatusMap.set(log.dailyRecoveryId, log.status);
      }
    }

    return Response.json({
      ok: true,
      maxTasks: MAX_ACTIVE_TASKS,
      tasks: tasks.map((t) => ({
        id: t.id,
        recoveryDomain: t.recoveryDomain,
        customDomain: t.customDomain,
        difficultyNote: t.difficultyNote,
        currentTaskText: t.currentTaskText,
        hasTodayStatus: todayStatusMap.has(t.id),
        todayStatus: todayStatusMap.get(t.id) ?? null,
        reminderEnabled: t.reminderEnabled,
        reminderTime: t.reminderTime ?? null,
        continuationDays: t.continuationDays ?? null,
        continuationReminderEnabled: t.continuationReminderEnabled ?? null,
        continuationReminderTime: t.continuationReminderTime ?? null,
        continuationPromptDismissed: t.continuationPromptDismissed,
        statusLogEverCount: everLogCountMap.get(t.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error("daily-recovery GET:", error);
    return Response.json(
      {
        ok: false,
        error: "加载日常恢复失败",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法操作日常恢复" },
        { status: 401 },
      );
    }
    const body = (await request.json()) as PostBody;
    const action = asString(body.action);

    if (!action) {
      return Response.json({ ok: false, error: "缺少操作类型" }, { status: 400 });
    }

    if (action === "logAddTaskClick") {
      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          eventType: "click_add_task",
          detail: {},
        },
      });
      return Response.json({ ok: true });
    }

    if (action === "generateCandidates") {
      const recoveryDomain = asString(body.recoveryDomain).trim();
      const difficultyNote = asString(body.difficultyNote).trim();
      const suggestion = asString(body.suggestion).trim();

      if (!recoveryDomain) {
        return Response.json(
          { ok: false, error: "请选择或填写恢复领域" },
          { status: 400 },
        );
      }
      if (!difficultyNote) {
        return Response.json(
          { ok: false, error: "请简单写一点当前困难" },
          { status: 400 },
        );
      }

      const [supportContext, currentState] = await Promise.all([
        prisma.userSupportContext.findUnique({
          where: { userId },
        }),
        prisma.currentState.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const candidates = await generateDailyRecoveryCandidates({
        recoveryDomain,
        difficultyNote,
        likedActivities: supportContext?.likedActivities ?? null,
        suggestionLine: suggestion || undefined,
        currentState: currentState
          ? {
              emotional: currentState.emotional,
              physical: currentState.physical,
              spatial: currentState.spatial,
            }
          : null,
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          eventType: suggestion ? "generate_candidates_with_suggestion" : "generate_candidates",
          detail: {
            recoveryDomain,
            difficultyNote,
            suggestion: suggestion || null,
            candidates,
          },
        },
      });

      return Response.json({ ok: true, candidates });
    }

    if (action === "saveTaskSelection") {
      const taskText = asString(body.taskText).trim();
      const recoveryDomain = asString(body.recoveryDomain).trim();
      const difficultyNote = asString(body.difficultyNote).trim();
      const rawTaskId = asString(body.taskId).trim();

      if (!recoveryDomain) {
        return Response.json(
          { ok: false, error: "请选择或填写恢复领域" },
          { status: 400 },
        );
      }
      if (!difficultyNote) {
        return Response.json(
          { ok: false, error: "请简单写一点当前困难" },
          { status: 400 },
        );
      }
      if (!taskText) {
        return Response.json(
          { ok: false, error: "请选择一个小步任务" },
          { status: 400 },
        );
      }

      const activeCount = await prisma.dailyRecovery.count({
        where: { userId, isDeleted: false },
      });

      let record;
      if (rawTaskId) {
        record = await prisma.dailyRecovery.update({
          where: { id: rawTaskId },
          data: {
            recoveryDomain,
            customDomain: null,
            difficultyNote,
            currentTaskText: taskText,
            isDeleted: false,
          },
        });
      } else {
        if (activeCount >= MAX_ACTIVE_TASKS) {
          return Response.json(
            { ok: false, error: "目前已经有 3 个小任务了，先删掉一个再试试。" },
            { status: 400 },
          );
        }
        record = await prisma.dailyRecovery.create({
          data: {
            userId,
            recoveryDomain,
            customDomain: null,
            difficultyNote,
            currentTaskText: taskText,
          },
        });
      }

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: record.id,
          eventType: rawTaskId ? "reset_task" : "create_task",
          detail: {
            recoveryDomain,
            difficultyNote,
            selectedTaskText: taskText,
          },
        },
      });

      return Response.json({ ok: true, taskId: record.id });
    }

    if (action === "addTaskFromChatSuggestion") {
      const taskText = asString(body.taskText).trim();
      const messageId = asString(body.messageId).trim();

      if (!taskText) {
        return Response.json({ ok: false, error: "没有找到可添加的小步内容" }, { status: 400 });
      }

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          eventType: "click_add_chat_suggestion_to_recovery",
          detail: {
            messageId: messageId || null,
            suggestedAction: taskText,
          },
        },
      });

      const activeCount = await prisma.dailyRecovery.count({
        where: { userId, isDeleted: false },
      });

      if (activeCount >= MAX_ACTIVE_TASKS) {
        await prisma.dailyRecoveryEventLog.create({
          data: {
            userId,
            eventType: "add_chat_suggestion_rejected_limit",
            detail: {
              messageId: messageId || null,
              suggestedAction: taskText,
            },
          },
        });
        return Response.json(
          {
            ok: false,
            error: "目前日常恢复里已经有 3 个小任务了，先删掉或完成一个再添一条吧。",
          },
          { status: 400 },
        );
      }

      const record = await prisma.dailyRecovery.create({
        data: {
          userId,
          recoveryDomain: "其他",
          customDomain: "聊天小步",
          difficultyNote: "来自支持与陪伴对话的一条可执行小步。",
          currentTaskText: taskText,
        },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: record.id,
          eventType: "create_task_from_chat_suggestion",
          detail: {
            messageId: messageId || null,
            suggestedAction: taskText,
          },
        },
      });

      return Response.json({ ok: true, taskId: record.id });
    }

    if (action === "saveCustomOwnTask") {
      const taskText = asString(body.taskText).trim();

      if (!taskText) {
        return Response.json({ ok: false, error: "请先写一件今天想试的小事" }, { status: 400 });
      }

      const activeCount = await prisma.dailyRecovery.count({
        where: { userId, isDeleted: false },
      });
      if (activeCount >= MAX_ACTIVE_TASKS) {
        return Response.json(
          {
            ok: false,
            error: "目前已经有 3 个小任务了，先删掉一个再试试。",
          },
          { status: 400 },
        );
      }

      const record = await prisma.dailyRecovery.create({
        data: {
          userId,
          recoveryDomain: "其他",
          customDomain: "自选小任务",
          difficultyNote: "自选小任务",
          currentTaskText: taskText,
        },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: record.id,
          eventType: "create_task_custom_own",
          detail: {
            selectedTaskText: taskText,
          },
        },
      });

      return Response.json({ ok: true, taskId: record.id });
    }

    if (action === "setTaskReminder") {
      const taskId = asString(body.taskId).trim();
      const enabled = typeof body.reminderEnabled === "boolean" ? body.reminderEnabled : false;
      const timeRaw = asString(body.reminderTime).trim();

      if (!taskId) {
        return Response.json({ ok: false, error: "缺少任务 ID" }, { status: 400 });
      }

      if (enabled && !timeRaw) {
        return Response.json(
          { ok: false, error: "如果希望我提醒一下，请先选一个大致时间。" },
          { status: 400 },
        );
      }

      const existing = await prisma.dailyRecovery.findUnique({
        where: { id: taskId },
      });
      if (!existing || existing.isDeleted) {
        return Response.json({ ok: false, error: "这个小任务已经不存在了" }, { status: 404 });
      }

      await prisma.dailyRecovery.update({
        where: { id: taskId },
        data: {
          reminderEnabled: enabled,
          reminderTime: enabled ? timeRaw : null,
        },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: taskId,
          eventType: "set_task_reminder",
          detail: {
            reminderEnabled: enabled,
            reminderTime: enabled ? timeRaw : null,
          },
        },
      });

      return Response.json({ ok: true });
    }

    if (action === "setContinuationPreferences") {
      const taskId = asString(body.taskId).trim();
      const daysSource =
        typeof body.continuationDays === "number"
          ? body.continuationDays
          : body.continuationDays;
      const daysRaw = Number.parseInt(String(daysSource ?? "").trim(), 10);
      const continuationRem =
        typeof body.continuationReminderEnabled === "boolean"
          ? body.continuationReminderEnabled
          : false;

      if (!taskId) {
        return Response.json({ ok: false, error: "缺少任务 ID" }, { status: 400 });
      }
      if (!Number.isFinite(daysRaw) || daysRaw < 1 || daysRaw > 30) {
        return Response.json(
          { ok: false, error: "请填写 1～30 之间的天数" },
          { status: 400 },
        );
      }

      let continuationReminderTime: string | null = null;
      if (continuationRem) {
        continuationReminderTime = asString(body.continuationReminderTime).trim();
        if (!continuationReminderTime) {
          return Response.json(
            { ok: false, error: "如果希望继续提醒，请选一下大致提醒时间。" },
            { status: 400 },
          );
        }
      }

      const existing = await prisma.dailyRecovery.findUnique({
        where: { id: taskId },
      });
      if (!existing || existing.isDeleted) {
        return Response.json({ ok: false, error: "这个小任务已经不存在了" }, { status: 404 });
      }

      await prisma.dailyRecovery.update({
        where: { id: taskId },
        data: {
          continuationDays: daysRaw,
          continuationReminderEnabled: continuationRem,
          continuationReminderTime: continuationReminderTime,
        },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: taskId,
          eventType: "set_continuation_preferences",
          detail: {
            continuationDays: daysRaw,
            continuationReminderEnabled: continuationRem,
            continuationReminderTime: continuationReminderTime,
          },
        },
      });

      return Response.json({ ok: true });
    }

    if (action === "dismissContinuationPrompt") {
      const taskId = asString(body.taskId).trim();
      if (!taskId) {
        return Response.json({ ok: false, error: "缺少任务 ID" }, { status: 400 });
      }

      const existing = await prisma.dailyRecovery.findUnique({
        where: { id: taskId },
      });
      if (!existing || existing.isDeleted) {
        return Response.json({ ok: false, error: "这个小任务已经不存在了" }, { status: 404 });
      }

      await prisma.dailyRecovery.update({
        where: { id: taskId },
        data: { continuationPromptDismissed: true },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: taskId,
          eventType: "dismiss_continuation_prompt",
          detail: {},
        },
      });

      return Response.json({ ok: true });
    }

    if (action === "swapTask") {
      const taskId = asString(body.taskId).trim();
      const taskText = asString(body.taskText).trim();
      if (!taskId || !taskText) {
        return Response.json({ ok: false, error: "参数不完整" }, { status: 400 });
      }

      const existing = await prisma.dailyRecovery.findUnique({
        where: { id: taskId },
      });
      if (!existing || existing.isDeleted) {
        return Response.json({ ok: false, error: "这个小任务已经不存在了" }, { status: 404 });
      }

      const updated = await prisma.dailyRecovery.update({
        where: { id: taskId },
        data: {
          currentTaskText: taskText,
        },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: updated.id,
          eventType: "swap_task",
          detail: {
            recoveryDomain: updated.recoveryDomain,
            difficultyNote: updated.difficultyNote,
            newTaskText: taskText,
          },
        },
      });

      return Response.json({ ok: true });
    }

    if (action === "updateStatus") {
      const taskId = asString(body.taskId).trim();
      const status = asString(body.status);

      if (!taskId) {
        return Response.json({ ok: false, error: "缺少任务 ID" }, { status: 400 });
      }
      if (status !== "done" && status !== "partial" && status !== "skipped") {
        return Response.json({ ok: false, error: "无效的状态" }, { status: 400 });
      }

      const existing = await prisma.dailyRecovery.findUnique({
        where: { id: taskId },
      });
      if (!existing || existing.isDeleted || !existing.currentTaskText) {
        return Response.json(
          { ok: false, error: "当前没有进行中的小步任务" },
          { status: 400 },
        );
      }

      const priorStatusLogs = await prisma.dailyRecoveryStatusLog.count({
        where: { dailyRecoveryId: taskId, userId },
      });

      const existingLog = await prisma.dailyRecoveryStatusLog.findFirst({
        where: {
          userId,
          dailyRecoveryId: taskId,
          createdAt: { gte: startOfToday() },
        },
      });

      if (existingLog) {
        return Response.json(
          {
            ok: false,
            error: "今天已经记过一次了，不需要重复点。",
          },
          { status: 400 },
        );
      }

      const statusLog = await prisma.dailyRecoveryStatusLog.create({
        data: {
          userId,
          dailyRecoveryId: taskId,
          status,
        },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: taskId,
          eventType: "update_status",
          detail: { status },
        },
      });

      if (status === "done" || status === "partial") {
        await recordProgressEvent({
          userId,
          eventType:
            status === "done"
              ? RECOVERY_EVENT_TYPES.TINY_STEP_DONE
              : RECOVERY_EVENT_TYPES.TINY_STEP_PARTIAL,
          scoreDelta: status === "done" ? 1 : 0.5,
          sourceId: statusLog.id,
          metadata: {
            dailyRecoveryId: taskId,
            status,
          },
        });
        await recomputeRecoveryProgressState(userId);
        await maybeGenerateProgressLetter(userId);
      }

      let message: string;
      if (status === "done") message = pickOne(ENCOURAGE_DONE);
      else if (status === "partial") message = pickOne(ENCOURAGE_PARTIAL);
      else message = pickOne(HOLD_SKIPPED);

      const firstStatusLogEver = priorStatusLogs === 0;

      return Response.json({
        ok: true,
        message,
        firstStatusLogEver,
      });
    }

    if (action === "deleteTask") {
      const taskId = asString(body.taskId).trim();
      if (!taskId) {
        return Response.json({ ok: false, error: "缺少任务 ID" }, { status: 400 });
      }

      const existing = await prisma.dailyRecovery.findUnique({
        where: { id: taskId },
      });
      if (!existing || existing.isDeleted) {
        return Response.json({ ok: true });
      }

      await prisma.dailyRecovery.update({
        where: { id: taskId },
        data: { isDeleted: true },
      });

      await prisma.dailyRecoveryEventLog.create({
        data: {
          userId,
          dailyRecoveryId: taskId,
          eventType: "delete_task",
          detail: {},
        },
      });

      return Response.json({ ok: true });
    }

    return Response.json({ ok: false, error: "未知的操作" }, { status: 400 });
  } catch (error) {
    console.error("daily-recovery POST:", error);
    return Response.json(
      {
        ok: false,
        error: "处理失败，请稍后再试",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
