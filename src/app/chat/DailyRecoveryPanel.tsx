"use client";

import { useCallback, useEffect, useState } from "react";

const DOMAIN_PRESETS = [
  "睡眠",
  "吃饭",
  "家务",
  "运动",
  "娱乐",
  "购物",
  "学习",
  "工作",
  "其他"
] as const;

type TodayStatus = "done" | "partial" | "skipped";

function getOptimisticStatusMessage(status: TodayStatus): string {
  if (status === "done") return "很好，你已经往前挪了一小步。";
  if (status === "partial") return "做了一部分也很好，这样已经算数。";
  return "没关系，今天这样也可以。";
}

type Task = {
  id: string;
  recoveryDomain: string;
  customDomain: string | null;
  difficultyNote: string;
  currentTaskText: string | null;
  hasTodayStatus: boolean;
  todayStatus: TodayStatus | null;
  reminderEnabled: boolean;
  reminderTime: string | null;
  continuationDays: number | null;
  continuationReminderEnabled: boolean | null;
  continuationReminderTime: string | null;
  continuationPromptDismissed: boolean;
  statusLogEverCount: number;
};

type UiPhase =
  | "loading"
  | "list"
  | "emptyIntro"
  | "domain"
  | "customOwn"
  | "difficulty"
  | "generating"
  | "pick";

type StatusFlow =
  | {
      kind: "feedback";
      taskId: string;
      message: string;
      openContinuationNext: boolean;
    }
  | { kind: "continuationFlow"; taskId: string };

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeTask(raw: unknown): Task {
  const o = raw as Record<string, unknown>;
  const ts = o.todayStatus;
  const todayStatus: TodayStatus | null =
    ts === "done" || ts === "partial" || ts === "skipped" ? ts : null;
  const contDays = o.continuationDays;
  const continuationDays =
    typeof contDays === "number" &&
    !Number.isNaN(contDays) &&
    Number.isFinite(contDays)
      ? contDays
      : contDays === null || contDays === undefined
        ? null
        : Number(contDays);

  return {
    id: String(o.id ?? ""),
    recoveryDomain: String(o.recoveryDomain ?? ""),
    customDomain: o.customDomain == null ? null : String(o.customDomain),
    difficultyNote: String(o.difficultyNote ?? ""),
    currentTaskText:
      o.currentTaskText == null ? null : String(o.currentTaskText),
    hasTodayStatus: Boolean(o.hasTodayStatus),
    todayStatus,
    reminderEnabled: Boolean(o.reminderEnabled),
    reminderTime: o.reminderTime == null ? null : String(o.reminderTime),
    continuationDays,
    continuationReminderEnabled:
      typeof o.continuationReminderEnabled === "boolean"
        ? o.continuationReminderEnabled
        : o.continuationReminderEnabled == null
          ? null
          : Boolean(o.continuationReminderEnabled),
    continuationReminderTime:
      o.continuationReminderTime == null
        ? null
        : String(o.continuationReminderTime),
    continuationPromptDismissed: Boolean(o.continuationPromptDismissed),
    statusLogEverCount:
      typeof o.statusLogEverCount === "number" ? o.statusLogEverCount : 0,
  };
}

function taskEligibleForContinuationInvite(t: Task): boolean {
  return (
    t.statusLogEverCount >= 1 &&
    t.continuationDays === null &&
    !t.continuationPromptDismissed
  );
}

function StatusFeedbackOverlay({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-stone-900/20 p-3 sm:justify-center sm:p-6">
      <div
        className="mx-auto w-full max-w-sm rounded-2xl border border-stone-200/90 bg-[#fcfbf9] px-4 py-4 shadow-xl"
        role="dialog"
        aria-label="今日反馈"
      >
        <p className="text-sm leading-relaxed text-stone-800">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-700"
        >
          知道了
        </button>
      </div>
    </div>
  );
}

function ContinuationFlowOverlay({
  busy,
  onDismiss,
  onSave,
}: {
  busy: boolean;
  onDismiss: () => Promise<void> | void;
  onSave: (days: number) => Promise<void> | void;
}) {
  const [stage, setStage] = useState<"invite" | "days">("invite");
  const [rawDays, setRawDays] = useState("5");

  const confirmDays = () => {
    const n = Number.parseInt(rawDays.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 30) return;
    void onSave(n);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-stone-900/20 p-3 sm:justify-center sm:p-6">
      <div
        className="mx-auto w-full max-w-sm rounded-2xl border border-stone-200/90 bg-[#fcfbf9] px-4 py-4 shadow-xl"
        role="dialog"
        aria-label="继续设置"
      >
        {stage === "invite" ? (
          <>
            <p className="text-sm font-medium text-stone-800">这个小任务你想继续保留吗？</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDismiss()}
                className="w-full rounded-xl border border-stone-200/80 py-2.5 text-sm text-stone-700 hover:bg-white disabled:opacity-60"
              >
                先不用
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setStage("days")}
                className="w-full rounded-xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-60"
              >
                想持续几天
              </button>
            </div>
          </>
        ) : null}

        {stage === "days" ? (
          <>
            <p className="text-sm font-medium text-stone-800">这个小任务想继续几天？</p>
            <p className="mt-2 text-[12px] leading-relaxed text-stone-500">
              轻量设置一个天数就好。
            </p>
            <label
              htmlFor="dr-continuation-flow-days"
              className="mt-4 block text-[12px] text-stone-600"
            >
              天数（1～30）
            </label>
            <input
              id="dr-continuation-flow-days"
              inputMode="numeric"
              pattern="[0-9]*"
              value={rawDays}
              onChange={(e) => setRawDays(e.target.value.replace(/[^\d]/g, ""))}
              className="mt-1 w-full rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-sm"
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStage("invite")}
                className="w-full rounded-xl border border-stone-200/80 py-2.5 text-sm text-stone-700 hover:bg-white disabled:opacity-60"
              >
                返回
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmDays()}
                className="w-full rounded-xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-60"
              >
                {busy ? "保存中…" : "确定"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DailyRecoveryPanel({
  onRequestClose,
  className = "",
  onProgressChanged,
}: {
  /** 移动端弹层传入，用于显示「关闭」 */
  onRequestClose?: () => void;
  className?: string;
  onProgressChanged?: () => void;
}) {
  const [phase, setPhase] = useState<UiPhase>("loading");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [maxTasks, setMaxTasks] = useState<number>(3);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [domainChoice, setDomainChoice] = useState<string>("睡眠");
  const [domainOther, setDomainOther] = useState("");
  const [difficultyDraft, setDifficultyDraft] = useState("");
  const [candidates, setCandidates] = useState<string[] | null>(null);

  const [statusFlow, setStatusFlow] = useState<StatusFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 用于“做了/部分做了/今天没做”点击后的乐观 UI：避免用户在后端返回前重复点。 */
  const [statusPendingTaskId, setStatusPendingTaskId] = useState<string | null>(null);

  const [regenerateSuggestion, setRegenerateSuggestion] = useState("");
  /** 暂回到引导页（不删数据） */
  const [dismissedToIntro, setDismissedToIntro] = useState(false);

  const [customOwnDraft, setCustomOwnDraft] = useState("");
  const resolveDomainLabel = useCallback(() => {
    if (domainChoice === "其他") {
      return domainOther.trim();
    }
    return domainChoice;
  }, [domainChoice, domainOther]);

  const applyTaskToForm = useCallback((t?: Task) => {
    const d = t?.recoveryDomain ?? "睡眠";
    if (
      DOMAIN_PRESETS.includes(d as (typeof DOMAIN_PRESETS)[number]) &&
      d !== "其他"
    ) {
      setDomainChoice(d);
      setDomainOther("");
    } else {
      setDomainChoice("其他");
      setDomainOther(t?.customDomain ?? d);
    }
    setDifficultyDraft(t?.difficultyNote ?? "");
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setPhase("loading");
    try {
      const res = await fetch("/api/daily-recovery");
      const data = await parseJson(res);
      if (!res.ok || data.ok !== true) {
        throw new Error(
          typeof data.error === "string" ? data.error : "加载失败",
        );
      }
      const list = Array.isArray(data.tasks)
        ? (data.tasks as unknown[]).map(normalizeTask)
        : [];
      setTasks(list);
      setMaxTasks(typeof data.maxTasks === "number" ? data.maxTasks : 3);
      setEditingTaskId(null);
      if (list.length === 0) {
        setDismissedToIntro(false);
        setPhase("emptyIntro");
      } else {
        setPhase("list");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setPhase("emptyIntro");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/daily-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await parseJson(res);
    if (!res.ok || data.ok !== true) {
      const msg =
        typeof data.error === "string" && data.error
          ? data.error
          : "请求失败，请稍后再试";
      throw new Error(msg);
    }
    return data;
  };

  const submitContinuationPreferences = async (
    taskId: string,
    continuationDays: number,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await postAction({
        action: "setContinuationPreferences",
        taskId,
        continuationDays,
        continuationReminderEnabled: false,
        continuationReminderTime: "",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const dismissContinuation = async (taskId: string) => {
    setBusy(true);
    setError(null);
    try {
      await postAction({ action: "dismissContinuationPrompt", taskId });
      await load();
      setStatusFlow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const runGenerate = async (params?: {
    recoveryDomain?: string;
    difficultyNote?: string;
    suggestion?: string;
    clearSuggestionAfterSuccess?: boolean;
  }) => {
    setBusy(true);
    setError(null);
    setStatusFlow(null);
    setPhase("generating");
    try {
      const data = await postAction({
        action: "generateCandidates",
        ...(params?.recoveryDomain
          ? { recoveryDomain: params.recoveryDomain }
          : {}),
        ...(params?.difficultyNote
          ? { difficultyNote: params.difficultyNote }
          : {}),
        ...(params?.suggestion ? { suggestion: params.suggestion } : {}),
      });
      const list = data.candidates;
      if (!Array.isArray(list) || list.length < 3) {
        throw new Error("生成结果异常，请重试");
      }
      setCandidates(list.map((x) => String(x)));
      setPhase("pick");
      if (params?.clearSuggestionAfterSuccess) {
        setRegenerateSuggestion("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
      setPhase("difficulty");
    } finally {
      setBusy(false);
    }
  };

  const onStartIntro = () => {
    setDismissedToIntro(false);
    setDomainChoice("睡眠");
    setDomainOther("");
    setDifficultyDraft("");
    setCustomOwnDraft("");
    setError(null);
    setEditingTaskId(null);
    setPhase("domain");
  };

  const onSaveCustomOwnTask = async () => {
    const t = customOwnDraft.trim();
    if (!t) return;
    if (tasks.length >= maxTasks) {
      setError("目前已经有 3 个小任务了，先删掉一个再试试。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postAction({
        action: "saveCustomOwnTask",
        taskText: t,
      });
      await load();
      setCustomOwnDraft("");
      setPhase("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const onDomainNext = () => {
    const label = resolveDomainLabel();
    if (!label) {
      setError("请填写你的恢复领域名称");
      return;
    }
    setError(null);
    setPhase("difficulty");
  };

  const onDifficultyGenerate = async () => {
    const label = resolveDomainLabel();
    if (!label) {
      setError("请填写你的恢复领域名称");
      return;
    }
    if (!difficultyDraft.trim()) {
      setError("请简单写一点当前困难");
      return;
    }
    setError(null);
    try {
      await runGenerate({
        recoveryDomain: label,
        difficultyNote: difficultyDraft.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
      setPhase("difficulty");
    }
  };

  const onSelectCandidate = async (taskText: string) => {
    setBusy(true);
    setError(null);
    try {
      const label = resolveDomainLabel();
      await postAction({
        action: "saveTaskSelection",
        taskId: editingTaskId ?? undefined,
        recoveryDomain: label,
        difficultyNote: difficultyDraft.trim(),
        taskText,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const onStatus = async (
    taskId: string,
    status: "done" | "partial" | "skipped",
  ) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    if (target.hasTodayStatus) return;
    if (statusPendingTaskId === taskId) return;

    // 乐观 UI：先立刻更新状态 + 弹出本地反馈；后端兜底失败再回滚。
    const rollbackSnapshot: Task = { ...target };
    const nextEver = (target.statusLogEverCount ?? 0) + 1;
    const provisional: Task = {
      ...target,
      hasTodayStatus: true,
      todayStatus: status,
      statusLogEverCount: nextEver,
    };

    setStatusPendingTaskId(taskId);
    setError(null);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              hasTodayStatus: true,
              todayStatus: status,
              statusLogEverCount: t.statusLogEverCount + 1,
            }
          : t,
      ),
    );

    setStatusFlow({
      kind: "feedback",
      taskId,
      message: getOptimisticStatusMessage(status),
      openContinuationNext: taskEligibleForContinuationInvite(provisional),
    });

    void (async () => {
      try {
        const data = await postAction({
          action: "updateStatus",
          status,
          taskId,
        });
        const msg = data.message;
        const text = typeof msg === "string" ? msg.trim() : "";
        if (text) {
          setStatusFlow((prev) => {
            if (!prev || prev.kind !== "feedback" || prev.taskId !== taskId)
              return prev;
            return { ...prev, message: text };
          });
        }
        if ((status === "done" || status === "partial") && onProgressChanged) {
          onProgressChanged();
        }
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...rollbackSnapshot } : t)),
        );
        setStatusFlow(null);
        setError(e instanceof Error ? e.message : "提交失败");
      } finally {
        setStatusPendingTaskId(null);
      }
    })();
  };

  const onSwapTask = async (task: Task) => {
    setEditingTaskId(task.id);
    applyTaskToForm(task);
    setError(null);
    setRegenerateSuggestion("");
    void runGenerate({
      recoveryDomain: task.recoveryDomain,
      difficultyNote: task.difficultyNote,
    });
  };

  const onBackToDifficultyFromPick = () => {
    setCandidates(null);
    setPhase("difficulty");
  };

  const onRegenerateWithoutSuggestion = () => {
    const label = resolveDomainLabel();
    if (!label || !difficultyDraft.trim()) return;
    void runGenerate({
      recoveryDomain: label,
      difficultyNote: difficultyDraft.trim(),
    });
  };

  const onRegenerateWithSuggestion = () => {
    const text = regenerateSuggestion.trim();
    const label = resolveDomainLabel();
    if (!label || !difficultyDraft.trim()) return;
    void runGenerate({
      recoveryDomain: label,
      difficultyNote: difficultyDraft.trim(),
      suggestion: text || undefined,
      clearSuggestionAfterSuccess: true,
    });
  };

  const onResetTaskSetup = (task: Task) => {
    setEditingTaskId(task.id);
    applyTaskToForm(task);
    setCandidates(null);
    setStatusFlow(null);
    setError(null);
    setPhase("domain");
  };

  const onDeleteTask = async (task: Task) => {
    setBusy(true);
    setError(null);
    try {
      await postAction({ action: "deleteTask", taskId: task.id });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const onClickAddNewTask = async () => {
    if (tasks.length >= maxTasks) {
      setError("目前已经有 3 个小任务了，先删掉一个再试试。");
      return;
    }
    try {
      void postAction({ action: "logAddTaskClick" });
    } catch {
      // 忽略埋点失败
    }
    onStartIntro();
  };

  const showDismissedIntro =
    phase === "list" && tasks.length > 0 && dismissedToIntro;
  const showIntroBlock = phase === "emptyIntro" || showDismissedIntro;

  return (
    <section
      lang="zh-CN"
      className={`relative flex h-full min-h-0 flex-col border-stone-200/70 bg-[#fbf9f5] text-stone-800 ${className}`}
      aria-label="日常恢复"
    >
      <div className="flex items-start justify-between gap-2 border-b border-stone-200/60 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-stone-800">日常恢复</h2>
          <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
            慢慢回到日常
          </p>
        </div>
        {onRequestClose ? (
          <button
            type="button"
            onClick={onRequestClose}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-700"
          >
            关闭
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="mb-3 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {phase === "loading" ? (
            <p className="text-sm text-stone-500">加载中…</p>
          ) : null}

          {showIntroBlock ? (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-stone-600">
                这里可以和你一起选一件很小的事，慢慢恢复日常节奏。不用完成率，也没有对错。
              </p>
              <button
                type="button"
                onClick={onStartIntro}
                className="w-full rounded-2xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700"
              >
                开始设置
              </button>
            </div>
          ) : null}

          {phase === "domain" ? (
            <div className="space-y-4">
              <p className="text-xs font-medium tracking-wide text-stone-500">
                选择恢复领域
              </p>
              <fieldset className="space-y-2">
                <legend className="sr-only">恢复领域</legend>
                <div className="flex flex-col gap-2">
                  {DOMAIN_PRESETS.map((opt) => (
                    <label
                      key={opt}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition-colors ${
                        domainChoice === opt
                          ? "border-stone-500 bg-stone-100 text-stone-900"
                          : "border-stone-200/80 bg-white/90 text-stone-700 hover:border-stone-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="recovery-domain"
                        value={opt}
                        checked={domainChoice === opt}
                        onChange={() => setDomainChoice(opt)}
                        className="sr-only"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              </fieldset>
              {domainChoice === "其他" ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="domain-other"
                    className="text-xs text-stone-500"
                  >
                    你的领域名称
                  </label>
                  <input
                    id="domain-other"
                    value={domainOther}
                    onChange={(e) => setDomainOther(e.target.value)}
                    placeholder="例如：喝水、和人联系……"
                    className="w-full rounded-xl border border-stone-200/80 bg-white px-3 py-2 text-sm outline-none focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)]"
                  />
                </div>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setCustomOwnDraft("");
                  setPhase("customOwn");
                }}
                className="w-full rounded-xl border border-stone-300/80 bg-white py-2.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                我想自己写一个任务
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDomainNext}
                className="w-full rounded-2xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-60"
              >
                下一步
              </button>
            </div>
          ) : null}

          {phase === "customOwn" ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-stone-600">
                可以写一件今天比较容易开始的小事。
                <br />
                <span className="text-stone-500">
                  尽量写得具体一点、轻一点。
                </span>
              </p>
              <textarea
                value={customOwnDraft}
                onChange={(e) => setCustomOwnDraft(e.target.value)}
                rows={4}
                placeholder="例如：先喝几口温水……"
                className="w-full resize-none rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)]"
              />
              <button
                type="button"
                disabled={busy || !customOwnDraft.trim()}
                onClick={() => void onSaveCustomOwnTask()}
                className="w-full rounded-2xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "保存中…" : "保存为今天的小任务"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setPhase("domain");
                }}
                className="w-full rounded-xl border border-stone-200/80 py-2 text-sm text-stone-600 hover:bg-stone-100/80"
              >
                返回
              </button>
            </div>
          ) : null}

          {phase === "difficulty" ? (
            <div className="space-y-3">
              <p className="text-[13px] leading-relaxed text-stone-600">
                这个部分你现在最卡的是哪里？
                <br />
                <span className="text-stone-500">
                  不用说很多，告诉我最难的一小点也可以。
                </span>
              </p>
              <textarea
                value={difficultyDraft}
                onChange={(e) => setDifficultyDraft(e.target.value)}
                rows={4}
                placeholder="可以只写一两句话……"
                className="w-full resize-none rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-sm outline-none focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)]"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void onDifficultyGenerate()}
                className="w-full rounded-2xl bg-stone-600 py-2.5 text-sm font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-60"
              >
                {busy ? "生成中…" : "生成 3 个小步候选"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPhase("domain")}
                className="w-full rounded-xl border border-stone-200/80 py-2 text-sm text-stone-600 hover:bg-stone-100/80"
              >
                返回上一步
              </button>
            </div>
          ) : null}

          {phase === "generating" ? (
            <p className="text-sm text-stone-500">正在生成温和的小步建议…</p>
          ) : null}

          {phase === "pick" && candidates ? (
            <div className="space-y-4">
              <p className="text-[13px] text-stone-600">
                选一个今天想试试的小步（随时可以换）：
              </p>
              <ul className="space-y-2">
                {candidates.map((c, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onSelectCandidate(c)}
                      className="w-full rounded-xl border border-stone-200/80 bg-white/90 px-3 py-2.5 text-left text-sm leading-snug text-stone-800 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60"
                    >
                      {c}
                    </button>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-dashed border-stone-200/80 bg-white/70 px-3 py-3 text-xs text-stone-600">
                <p className="mb-2 font-medium text-stone-500">
                  如果这三条不太合适，可以换一批：
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onRegenerateWithoutSuggestion}
                    className="w-full rounded-lg border border-stone-300/80 bg-white py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                  >
                    换一批
                  </button>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="regenerate-suggestion"
                      className="text-[11px] text-stone-500"
                    >
                      或者先简单说一句这次你想要的感觉（可选）：
                    </label>
                    <input
                      id="regenerate-suggestion"
                      value={regenerateSuggestion}
                      onChange={(e) => setRegenerateSuggestion(e.target.value)}
                      placeholder="例如：想更轻一点 / 不要和出门有关 / 想要更像晚上能做的事……"
                      className="w-full rounded-lg border border-stone-200/80 bg-white px-2 py-1.5 text-xs outline-none focus:border-stone-300 focus:shadow-[0_0_0_2px_rgba(120,113,108,0.15)]"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onRegenerateWithSuggestion}
                      className="mt-1 w-full rounded-lg border border-stone-300/80 bg-white py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                    >
                      按我的建议换一批
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={onBackToDifficultyFromPick}
                className="w-full rounded-xl border border-stone-200/80 py-2 text-sm text-stone-600 hover:bg-stone-100/80 disabled:opacity-60"
              >
                返回上一步
              </button>
            </div>
          ) : null}

          {phase === "list" && tasks.length > 0 && !dismissedToIntro ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {tasks.map((task) => {
                  const recorded = task.hasTodayStatus;
                  const statusBtns: { key: TodayStatus; label: string }[] = [
                    { key: "done", label: "做了" },
                    { key: "partial", label: "部分做了" },
                    { key: "skipped", label: "今天没做" },
                  ];
                  return (
                    <article
                      key={task.id}
                      className={`relative rounded-xl border px-3 py-3 transition-colors ${
                        recorded
                          ? "border-stone-300/60 bg-stone-200/40 text-stone-500 saturate-[0.92]"
                          : "border-stone-200/80 bg-white/95 text-stone-800"
                      }`}
                    >
                      <p
                        className={`text-[11px] font-medium ${
                          recorded ? "text-stone-400" : "text-stone-500"
                        }`}
                      >
                        当前任务内容
                      </p>
                      <p
                        className={`mt-1.5 text-[14px] leading-relaxed ${
                          recorded ? "text-stone-500" : "text-stone-800"
                        }`}
                      >
                        {task.currentTaskText ??
                          "暂时还没有具体小步，可以重新设置。"}
                      </p>
                      {task.continuationDays != null ? (
                        <p className="mt-1 text-[11px] text-stone-500">
                          已记下这一段小步想再轻轻放在心上大约 {task.continuationDays}{" "}
                          天。
                        </p>
                      ) : null}
                      <p
                        className={`mt-3 mb-1 text-[11px] ${
                          recorded ? "text-stone-400" : "text-stone-500"
                        }`}
                      >
                        今天怎么样？
                      </p>
                      {!recorded ? (
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            disabled={
                              busy ||
                              statusPendingTaskId === task.id ||
                              !task.currentTaskText
                            }
                            onClick={() => void onStatus(task.id, "done")}
                            className="rounded-lg border border-stone-300/90 bg-white py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                          >
                            做了
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy ||
                              statusPendingTaskId === task.id ||
                              !task.currentTaskText
                            }
                            onClick={() => void onStatus(task.id, "partial")}
                            className="rounded-lg border border-stone-300/90 bg-white py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                          >
                            部分做了
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy ||
                              statusPendingTaskId === task.id ||
                              !task.currentTaskText
                            }
                            onClick={() => void onStatus(task.id, "skipped")}
                            className="rounded-lg border border-stone-300/90 bg-white py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                          >
                            今天没做
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-1.5">
                          {statusBtns.map(({ key, label }) => {
                            const selected = task.todayStatus === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                disabled
                                tabIndex={-1}
                                aria-current={selected ? "true" : undefined}
                                aria-pressed={selected ? true : undefined}
                                className={`rounded-lg border py-1.5 text-[13px] font-medium ${
                                  selected
                                    ? "border-stone-800 bg-stone-800 text-stone-50 shadow-md ring-2 ring-stone-500/35"
                                    : "border-stone-300/70 bg-stone-300/25 text-stone-400"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        <button
                          type="button"
                          disabled={busy || recorded || statusPendingTaskId === task.id}
                          onClick={() => onSwapTask(task)}
                          className="rounded-full border border-stone-300/80 bg-white px-2.5 py-1 text-[11px] text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          换一个任务
                        </button>
                        <button
                          type="button"
                          disabled={busy || recorded || statusPendingTaskId === task.id}
                          onClick={() => onResetTaskSetup(task)}
                          className="rounded-full border border-stone-300/80 bg-white px-2.5 py-1 text-[11px] text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          重新设置
                        </button>
                        <button
                          type="button"
                          disabled={busy || recorded || statusPendingTaskId === task.id}
                          onClick={() => void onDeleteTask(task)}
                          className="rounded-full border border-red-200/80 bg-white px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          删除任务
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-dashed border-stone-200/70 pt-3">
                <button
                  type="button"
                  disabled={busy || tasks.length >= maxTasks}
                  onClick={() => void onClickAddNewTask()}
                  className="w-full rounded-2xl border border-stone-300/80 bg-white py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  添加一个新的恢复小任务
                  {tasks.length >= maxTasks
                    ? "（最多3个）"
                    : null}
                </button>
              </div>
            </div>
          ) : null}
        </div>

      </div>

      {statusFlow?.kind === "feedback" ? (
        <StatusFeedbackOverlay
          message={statusFlow.message}
          onClose={() => {
            setStatusFlow((prev) => {
              if (prev?.kind !== "feedback") return null;
              return prev.openContinuationNext
                ? { kind: "continuationFlow", taskId: prev.taskId }
                : null;
            });
          }}
        />
      ) : null}

      {statusFlow?.kind === "continuationFlow" ? (
        <ContinuationFlowOverlay
          key={`cont-flow-${statusFlow.taskId}`}
          busy={busy}
          onDismiss={() => void dismissContinuation(statusFlow.taskId)}
          onSave={(days) => {
            const tid = statusFlow.taskId;
            void (async () => {
              await submitContinuationPreferences(tid, days);
              setStatusFlow(null);
            })();
          }}
        />
      ) : null}
    </section>
  );
}
