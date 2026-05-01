"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { DailyRecoveryPanel } from "@/app/chat/DailyRecoveryPanel";
import { DiaryModal } from "@/components/diary/DiaryModal";
import { ProgressPlantAndLetters } from "@/components/progress/PlantWidget";
import {
  ProgressLetterReader,
  ProgressPanel,
} from "@/components/progress/ProgressPanel";

type ChatRole = "assistant" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  suggestedAction?: string | null;
};

type ProgressLetter = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
};

const EMOTIONAL_OPTIONS = ["震惊", "自责", "羞耻", "愤怒", "焦虑", "反复回想", "难受","平静", "接受", "不想说","其他"] as const;
const PHYSICAL_OPTIONS = ["吃不好", "睡不好", "对什么都提不起兴趣", "有伤害自己的想法", "已经伤害过自己","正常", "不想说","其他"] as const;
const SPATIAL_OPTIONS = [
  "在家",
  "在学校/单位",
  "在路上/交通中",
  "不想说",
  "其他地方"
] as const;

const FEEDBACK_REASONS = [
  "太审问式了",
  "没有理解我",
  "忽略了我刚才说的重点",
  "太顺从我了",
  "太官方了",
  "其他",
] as const;

function lastAssistantMessage(messages: readonly ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i];
  }
  return null;
}

/** Avoids crashing on browsers where `crypto.randomUUID` is missing (e.g. older WebViews). */
function generateLocalChatMessageId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function FeedbackIconButton({ onOpen }: { onOpen: () => void }) {
  const [hintVisible, setHintVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const longPressActivatedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          longPressActivatedRef.current = false;
          clearTimer();
          timerRef.current = window.setTimeout(() => {
            longPressActivatedRef.current = true;
            setHintVisible(true);
            timerRef.current = null;
          }, 480);
        }}
        onPointerUp={() => {
          clearTimer();
          if (longPressActivatedRef.current) {
            window.setTimeout(() => {
              setHintVisible(false);
              longPressActivatedRef.current = false;
            }, 1600);
          }
        }}
        onPointerLeave={() => {
          clearTimer();
        }}
        onPointerCancel={clearTimer}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (longPressActivatedRef.current) {
            e.preventDefault();
            longPressActivatedRef.current = false;
            return;
          }
          onOpen();
        }}
        aria-label="我不喜欢这样说话"
        title="我不喜欢这样说话"
        className="inline-flex h-9 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-stone-300/55 bg-white/70 text-stone-500 shadow-[0_1px_2px_rgba(28,25,23,0.05)] transition-[color,background-color,border-color,box-shadow,transform] hover:border-stone-400/75 hover:bg-stone-100/90 hover:text-stone-600 hover:shadow-[0_1px_3px_rgba(28,25,23,0.08)] active:scale-[0.96] active:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/65 sm:h-7 sm:min-h-0 sm:min-w-0"
      >
        <svg
          className="h-[14px] w-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.35}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="8.25" />
          <path d="M12 8.4v5.1" />
          <circle cx="12" cy="16.55" r="1.65" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-stone-800/90 px-2 py-1 text-[11px] font-normal leading-tight text-stone-100 shadow-sm transition-opacity duration-150 max-sm:bottom-[calc(100%+0.35rem)] max-sm:left-1/2 max-sm:top-auto max-sm:ml-0 max-sm:-translate-x-1/2 max-sm:translate-y-0 sm:left-full sm:top-1/2 sm:ml-2 sm:-translate-y-1/2 ${
          hintVisible
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
      >
        我不喜欢这样说话
      </span>
    </div>
  );
}

function MultiSelectOptionGroupWithOther({
  name,
  selectedValues,
  onToggleValue,
  options,
  legend,
  otherText,
  onOtherTextChange,
  otherPlaceholder,
}: {
  name: string;
  selectedValues: readonly string[];
  onToggleValue: (v: string) => void;
  options: readonly string[];
  legend: string;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  otherPlaceholder: string;
}) {
  const otherOption = "其他";
  const showOther = selectedValues.includes(otherOption);

  return (
    <fieldset className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <legend className="text-xs font-medium tracking-wide text-stone-500">
          {legend}
        </legend>
        <p className="text-[11px] text-stone-400">可多选</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = selectedValues.includes(opt);
          return (
            <label
              key={opt}
              className={`flex min-h-11 cursor-pointer items-center rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                checked
                  ? "border-stone-500 bg-stone-100 text-stone-900 shadow-sm"
                  : "border-stone-200/80 bg-white/90 text-stone-700 hover:border-stone-300"
              }`}
            >
              <input
                type="checkbox"
                name={name}
                value={opt}
                checked={checked}
                onChange={() => onToggleValue(opt)}
                className="sr-only"
              />
              {opt}
            </label>
          );
        })}
      </div>

      {showOther ? (
        <div className="space-y-1.5">
          <label className="text-xs text-stone-500">
            其他（你可以自由补充）
          </label>
          <textarea
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            rows={3}
            placeholder={otherPlaceholder}
            className="w-full resize-none rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-[15px] text-stone-800 outline-none focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)]"
          />
        </div>
      ) : null}
    </fieldset>
  );
}

type CurrentStateSaved = {
  emotional: string;
  physical: string;
  spatial: string;
};

type CurrentStateDraft = {
  emotional: string[];
  emotionalOther: string;
  physical: string[];
  physicalOther: string;
  spatial: string[];
  spatialOther: string;
};

const EMPTY_CURRENT_STATE_SAVED: CurrentStateSaved = {
  emotional: "",
  physical: "",
  spatial: "",
};

const EMPTY_CURRENT_STATE_DRAFT: CurrentStateDraft = {
  emotional: [],
  emotionalOther: "",
  physical: [],
  physicalOther: "",
  spatial: [],
  spatialOther: "",
};

function parseStoredMultiValue(
  stored: string,
  knownOptions: readonly string[],
): { selected: string[]; otherText: string } {
  const tokens = stored
    .split("、")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { selected: [], otherText: "" };

  const known = new Set(knownOptions.filter((x) => x !== "其他"));
  const selected: string[] = [];
  const otherTokens: string[] = [];

  for (const t of tokens) {
    if (known.has(t)) selected.push(t);
    else otherTokens.push(t);
  }

  const otherText = otherTokens.join("、");
  if (otherText) selected.push("其他");
  return { selected, otherText };
}

function formatMultiValueForStorage(
  selected: readonly string[],
  otherText: string,
): string {
  const trimmedOther = otherText.trim();
  const withoutOther = selected.filter((x) => x !== "其他");

  if (selected.includes("其他")) {
    return [...withoutOther, trimmedOther].filter(Boolean).join("、");
  }
  return withoutOther.join("、");
}

export default function ChatPage() {
  const router = useRouter();
  const [dailyRecoveryOpen, setDailyRecoveryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [currentStateLoaded, setCurrentStateLoaded] = useState(false);
  const [currentStateRequired, setCurrentStateRequired] = useState(false);
  const [savedCurrentState, setSavedCurrentState] = useState<CurrentStateSaved>(
    EMPTY_CURRENT_STATE_SAVED,
  );
  const [draftCurrentState, setDraftCurrentState] = useState<CurrentStateDraft>(
    EMPTY_CURRENT_STATE_DRAFT,
  );
  const [currentStateLastSavedAt, setCurrentStateLastSavedAt] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<ChatMessage | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<string[]>([]);
  const [feedbackOtherText, setFeedbackOtherText] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackFormError, setFeedbackFormError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [progressPanelOpen, setProgressPanelOpen] = useState(false);
  const [progressStage, setProgressStage] = useState(0);
  const [progressHasUnread, setProgressHasUnread] = useState(false);
  const [progressLetters, setProgressLetters] = useState<ProgressLetter[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<ProgressLetter | null>(null);
  const chatScrollAreaRef = useRef<HTMLDivElement | null>(null);

  const latestAssistant = lastAssistantMessage(messages);

  const openDailyRecoveryMobileOrFocusSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      document.getElementById("chat-daily-recovery-sidebar")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      return;
    }
    setDailyRecoveryOpen(true);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* cookie may still clear on success; fallback still redirect */
    }
    router.push("/login");
    router.refresh();
  }, [router]);

  const loadProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/progress");
      const data = (await res.json()) as {
        ok?: boolean;
        stage?: number;
        hasUnreadLetters?: boolean;
        letters?: ProgressLetter[];
      };
      if (!res.ok || !data.ok) return;
      setProgressStage(typeof data.stage === "number" ? data.stage : 0);
      setProgressHasUnread(Boolean(data.hasUnreadLetters));
      setProgressLetters(Array.isArray(data.letters) ? data.letters : []);
    } catch {
      // Keep UI resilient if progress API fails.
    }
  }, []);

  const markLetterRead = useCallback((letterId: string) => {
    void fetch("/api/progress-letter/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ letterId }),
    }).finally(() => {
      setProgressLetters((prev) => {
        const next = prev.map((x) => (x.id === letterId ? { ...x, isRead: true } : x));
        setProgressHasUnread(next.some((x) => !x.isRead));
        return next;
      });
    });
  }, []);

  const openLetterById = useCallback(
    (letterId: string) => {
      const target = progressLetters.find((x) => x.id === letterId) ?? null;
      setSelectedLetter(target);
      if (target && !target.isRead) {
        markLetterRead(target.id);
      }
    },
    [markLetterRead, progressLetters],
  );

  const openLatestUnreadLetter = useCallback(() => {
    const latestUnread = progressLetters.find((x) => !x.isRead) ?? null;
    if (!latestUnread) {
      setProgressPanelOpen(true);
      return;
    }
    setSelectedLetter(latestUnread);
    markLetterRead(latestUnread.id);
  }, [markLetterRead, progressLetters]);

  const openFeedbackForLatestAssistant = useCallback(() => {
    const target = lastAssistantMessage(messages);
    if (!target) return;
    setFeedbackMessage(target);
    setFeedbackReasons([]);
    setFeedbackOtherText("");
    setFeedbackFormError(null);
    setFeedbackOpen(true);
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setErrorMessage(null);

    try {
      setLoading(true);

      const userMsg: ChatMessage = {
        id: `local-${generateLocalChatMessageId()}`,
        role: "user",
        text: trimmed,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputText("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      let data: {
        ok?: boolean;
        reply?: string;
        messageId?: string;
        suggestedAction?: string | null;
      };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setErrorMessage("发送失败，请重试");
        return;
      }

      if (
        !res.ok ||
        !data.ok ||
        typeof data.reply !== "string" ||
        typeof data.messageId !== "string"
      ) {
        setErrorMessage("发送失败，请重试");
        return;
      }

      const reply = data.reply;
      const assistantId = data.messageId;
      const sug =
        typeof data.suggestedAction === "string" &&
        data.suggestedAction.trim() !== ""
          ? data.suggestedAction.trim()
          : null;

      setMessages((prev) => [
        ...prev,
        sug
          ? { id: assistantId, role: "assistant", text: reply, suggestedAction: sug }
          : { id: assistantId, role: "assistant", text: reply },
      ]);

      // 主回复返回后，suggestedAction 可能在后台补齐：做一个轻量重试读取，避免把按钮显示也卡在首包响应上。
      void (async () => {
        const maxAttempts = 6;
        const delays = [600, 900, 1300, 1800, 2500]; // 总计最多约 6 秒

        const tryOnce = async (attemptIndex: number) => {
          if (attemptIndex >= maxAttempts) return;
          try {
            const r = await fetch(
              `/api/chat/message?messageId=${encodeURIComponent(assistantId)}`,
            );
            if (!r.ok) throw new Error("not ok");
            const payload = (await r.json().catch(() => ({}))) as {
              ok?: boolean;
              suggestedAction?: string | null;
            };

            const nextSug =
              typeof payload.suggestedAction === "string"
                ? payload.suggestedAction.trim()
                : "";

            if (nextSug) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  if (m.role !== "assistant") return m;
                  return { ...m, suggestedAction: nextSug };
                }),
              );
              return;
            }
          } catch {
            // 忽略单次失败，继续重试。
          }

          const delay = delays[attemptIndex] ?? delays[delays.length - 1];
          window.setTimeout(() => {
            void tryOnce(attemptIndex + 1);
          }, delay);
        };

        void tryOnce(0);
      })();
    } catch {
      setErrorMessage("发送失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [inputText]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !currentStateRequired) setPanelOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, currentStateRequired]);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  useEffect(() => {
    if (!dailyRecoveryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDailyRecoveryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dailyRecoveryOpen]);

  // When the panel opens, copy last saved values into the draft (unsaved edits from a previous open are dropped).
  // useLayoutEffect avoids one frame of stale draft values before paint.
  useLayoutEffect(() => {
    if (!panelOpen) return;
    const emotionalParsed = parseStoredMultiValue(
      savedCurrentState.emotional,
      EMOTIONAL_OPTIONS,
    );
    const physicalParsed = parseStoredMultiValue(
      savedCurrentState.physical,
      PHYSICAL_OPTIONS,
    );
    const spatialParsed = parseStoredMultiValue(
      savedCurrentState.spatial,
      SPATIAL_OPTIONS,
    );

    setDraftCurrentState({
      emotional: emotionalParsed.selected,
      emotionalOther: emotionalParsed.otherText,
      physical: physicalParsed.selected,
      physicalOther: physicalParsed.otherText,
      spatial: spatialParsed.selected,
      spatialOther: spatialParsed.otherText,
    });
    // Only when the panel opens — not when `saved` changes while the user might be editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), kind === "success" ? 3500 : 5000);
  }, []);

  const addSuggestedToDailyRecovery = useCallback(
    async (msg: ChatMessage) => {
      if (!msg.suggestedAction) return;
      try {
        const res = await fetch("/api/daily-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "addTaskFromChatSuggestion",
            taskText: msg.suggestedAction,
            messageId: msg.id,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          taskId?: string;
        };
        if (!res.ok || !payload.ok) {
          throw new Error(
            typeof payload.error === "string" && payload.error.trim()
              ? payload.error
              : "暂时加不进去日常恢复",
          );
        }
        showToast("success", "已加入日常恢复");
        const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
        if (taskId) {
          window.dispatchEvent(
            new CustomEvent("daily-recovery-pending-reminder", {
              detail: { taskId },
            }),
          );
        }
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "添加失败");
      }
    },
    [showToast],
  );

  const closeFeedbackPanel = useCallback(() => {
    setFeedbackOpen(false);
    setFeedbackMessage(null);
    setFeedbackReasons([]);
    setFeedbackOtherText("");
    setFeedbackFormError(null);
  }, []);

  useEffect(() => {
    if (!feedbackOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFeedbackPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedbackOpen, closeFeedbackPanel]);

  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackMessage) return;
    if (feedbackReasons.length === 0) {
      setFeedbackFormError("请选择至少一项原因");
      return;
    }
    const includesOther = feedbackReasons.includes("其他");
    if (includesOther && !feedbackOtherText.trim()) {
      setFeedbackFormError("请补充说明具体哪里不合适");
      return;
    }
    setFeedbackFormError(null);
    setFeedbackSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: feedbackMessage.id,
          selectedReasons: feedbackReasons,
          otherText: includesOther ? feedbackOtherText.trim() : "",
          assistantReplyText: feedbackMessage.text,
          currentStateSnapshot: null,
        }),
      });
      if (!res.ok) {
        let message = "提交失败，请稍后再试";
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === "string" && data.error) message = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      closeFeedbackPanel();
      showToast("success", "反馈已提交");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "提交失败，请稍后再试");
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    closeFeedbackPanel,
    feedbackMessage,
    feedbackOtherText,
    feedbackReasons,
    showToast,
  ]);

  const handleSaveCurrentState = useCallback(async () => {
    const {
      emotional,
      emotionalOther,
      physical,
      physicalOther,
      spatial,
      spatialOther,
    } = draftCurrentState;

    if (emotional.length === 0 || physical.length === 0 || spatial.length === 0) {
      showToast("error", "请先把三个分类都选择一下");
      return;
    }

    const emotionalOtherTrim = emotionalOther.trim();
    const physicalOtherTrim = physicalOther.trim();
    const spatialOtherTrim = spatialOther.trim();

    const needEmotionalOther = emotional.includes("其他");
    const needPhysicalOther = physical.includes("其他");
    const needSpatialOther = spatial.includes("其他");

    if (needEmotionalOther && !emotionalOtherTrim) {
      showToast("error", "情绪选了“其他”，请补充你的描述");
      return;
    }
    if (needPhysicalOther && !physicalOtherTrim) {
      showToast("error", "身体选了“其他”，请补充你的描述");
      return;
    }
    if (needSpatialOther && !spatialOtherTrim) {
      showToast("error", "空间选了“其他”，请补充你的描述");
      return;
    }

    const emotionalStored = formatMultiValueForStorage(
      emotional,
      emotionalOtherTrim,
    );
    const physicalStored = formatMultiValueForStorage(
      physical,
      physicalOtherTrim,
    );
    const spatialStored = formatMultiValueForStorage(spatial, spatialOtherTrim);

    setSaving(true);
    try {
      const res = await fetch("/api/current-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emotional: emotionalStored,
          physical: physicalStored,
          spatial: spatialStored,
        }),
      });
      if (!res.ok) {
        let message = "保存失败，请稍后再试";
        try {
          const data = (await res.json()) as { error?: string };
          if (typeof data.error === "string" && data.error) message = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      setSavedCurrentState({
        emotional: emotionalStored,
        physical: physicalStored,
        spatial: spatialStored,
      });
      void loadProgress();
      setCurrentStateRequired(false);
      setCurrentStateLastSavedAt(new Date().toISOString());
      setPanelOpen(false);
      showToast("success", "当前状态已保存");
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "保存失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  }, [draftCurrentState, loadProgress, showToast]);

  useEffect(() => {
    // 进入 support AI 页面后：如果当天还没填过当前状态，就必须先弹窗填写。
    void (async () => {
      try {
        const res = await fetch("/api/current-state");
        const data = (await res.json()) as
          | { ok?: boolean; currentState?: null | { emotional: string | null; physical: string | null; spatial: string | null; createdAt: string } }
          | { ok?: boolean };

        if (!res.ok || (data as { ok?: boolean }).ok === false) {
          setCurrentStateLoaded(true);
          setCurrentStateRequired(true);
          setPanelOpen(true);
          return;
        }

        const cs = (data as { ok?: boolean; currentState?: null | any }).currentState ?? null;
        if (cs) {
          setSavedCurrentState({
            emotional: cs.emotional ?? "",
            physical: cs.physical ?? "",
            spatial: cs.spatial ?? "",
          });
          setCurrentStateLastSavedAt(typeof cs.createdAt === "string" ? cs.createdAt : null);

          const savedDate = cs.createdAt ? new Date(cs.createdAt) : null;
          const today = new Date();
          const isSameDay =
            savedDate &&
            savedDate.getFullYear() === today.getFullYear() &&
            savedDate.getMonth() === today.getMonth() &&
            savedDate.getDate() === today.getDate();

          const required = !isSameDay;
          setCurrentStateRequired(required);
          setPanelOpen(required);
        } else {
          setCurrentStateRequired(true);
          setPanelOpen(true);
        }
      } catch {
        setCurrentStateRequired(true);
        setPanelOpen(true);
      } finally {
        setCurrentStateLoaded(true);
      }
    })();

  }, []);

  useEffect(() => {
    if (!currentStateLoaded) return;
    if (panelOpen) return;
    if (messages.length !== 0) return;
    // 先自然打招呼，再让用户开始聊。
    setMessages([
      { id: "assistant-greeting-local", role: "assistant", text: "嗨，今天想从哪里开始聊呢？" },
    ]);
  }, [currentStateLoaded, panelOpen, messages.length]);

  return (
    <div
      lang="zh-CN"
      className="flex h-dvh min-h-dvh flex-col bg-[#f7f4ef] text-stone-800 lg:flex-row"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b border-stone-200/60 bg-[#fbf9f5]/90 px-2 py-2 sm:px-3 sm:py-2.5">
        <div className="mx-auto max-w-lg space-y-1.5">
          <div className="-mx-0.5 flex items-center gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5 sm:overflow-visible">
            <button
              type="button"
              onClick={openDailyRecoveryMobileOrFocusSidebar}
              className="shrink-0 rounded-full border border-stone-200/85 bg-white/75 px-2.5 py-1 text-[11px] font-medium text-stone-600 shadow-[0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm transition-colors active:bg-stone-100/85 sm:text-xs"
            >
              日常恢复
            </button>
            <button
              type="button"
              onClick={() => setDiaryOpen(true)}
              className="shrink-0 rounded-full border border-stone-200/85 bg-white/75 px-2.5 py-1 text-[11px] font-medium text-stone-600 shadow-[0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm transition-colors active:bg-stone-100/85 sm:text-xs"
            >
              写日记
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="shrink-0 rounded-full border border-stone-200/85 bg-white/75 px-2.5 py-1 text-[11px] font-medium text-stone-600 shadow-[0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm transition-colors active:bg-stone-100/85 sm:text-xs"
            >
              当前状态
            </button>
            <details className="group relative shrink-0">
              <summary
                aria-label="更多"
                className="flex list-none cursor-pointer items-center rounded-full border border-stone-200/85 bg-white/75 px-2 py-1 shadow-[0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-sm transition-colors marker:content-none active:bg-stone-100/85 [&::-webkit-details-marker]:hidden"
              >
                <span className="px-1 text-[14px] font-semibold leading-none text-stone-500">⋯</span>
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.25rem)] z-50 min-w-[10.5rem] overflow-hidden rounded-xl border border-stone-200/80 bg-[#fbf9f5]/98 py-1 text-left text-xs shadow-lg backdrop-blur-md">
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-stone-700 transition-colors hover:bg-stone-200/35"
                  onClick={(e) => {
                    const d = e.currentTarget.closest("details");
                    router.push("/onboarding");
                    if (d) (d as HTMLDetailsElement).open = false;
                  }}
                >
                  修改支持设定
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-stone-700 transition-colors hover:bg-stone-200/35"
                  onClick={(e) => {
                    const d = e.currentTarget.closest("details");
                    void handleLogout();
                    if (d) (d as HTMLDetailsElement).open = false;
                  }}
                >
                  退出
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
      <div
        ref={chatScrollAreaRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-4">
          {messages.map((msg) =>
            msg.role === "assistant" ? (
              <div
                key={msg.id}
                className="max-w-[88%] self-start flex flex-col gap-1.5"
              >
                <div className="rounded-2xl rounded-tl-md border border-stone-200/70 bg-white/90 px-4 py-3 text-[15px] leading-relaxed text-stone-700 shadow-sm">
                  {msg.text}
                </div>
                <div className="flex flex-col gap-1.5 pl-0.5">
                  {msg.suggestedAction ? (
                    <>
                      <p className="text-[11px] leading-snug text-stone-500">
                        可加入日常恢复的小步：
                        <span className="text-stone-800">{msg.suggestedAction}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => void addSuggestedToDailyRecovery(msg)}
                        className="min-h-9 self-start rounded-lg border border-stone-300/65 bg-white/90 px-3 py-2 text-[12px] text-stone-600 shadow-sm transition-colors hover:bg-stone-50 hover:text-stone-800"
                      >
                        加入日常恢复
                      </button>
                    </>
                  ) : null}
                  {latestAssistant && msg.id === latestAssistant.id ? (
                    <FeedbackIconButton onOpen={openFeedbackForLatestAssistant} />
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                key={msg.id}
                className="max-w-[88%] self-end rounded-2xl rounded-tr-md bg-[#e4ddd3] px-4 py-3 text-[15px] leading-relaxed text-stone-800"
              >
                {msg.text}
              </div>
            ),
          )}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-stone-200/60 bg-[#fbf9f5]/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-end gap-2">
            <div className="shrink-0 lg:hidden">
              <ProgressPlantAndLetters
                density="inline"
                stage={progressStage}
                hasUnread={progressHasUnread}
                onOpenLetters={() => setProgressPanelOpen(true)}
                onOpenLatestUnread={openLatestUnreadLetter}
              />
            </div>
            <div className="flex min-w-0 flex-1 items-end gap-1.5 rounded-2xl border border-stone-200/50 bg-[#f3f0ea]/75 px-1 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] sm:gap-2 sm:px-1.5 sm:py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <label htmlFor="chat-input" className="sr-only">
                  输入消息
                </label>
                <input
                  id="chat-input"
                  type="text"
                  name="message"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="想说什么都可以……"
                  className="min-h-[48px] w-full rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-base text-stone-800 placeholder:text-stone-400 outline-none ring-0 transition-shadow focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.12)] sm:text-[15px]"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] shrink-0 rounded-2xl bg-stone-600 px-5 py-3 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 active:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-4"
              >
                {loading ? "发送中…" : "发送"}
              </button>
            </div>
          </div>
          {errorMessage ? (
            <p className="text-xs text-red-700" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </form>
      </div>

      <aside
        id="chat-daily-recovery-sidebar"
        className="hidden h-dvh w-[min(20rem,36vw)] shrink-0 border-l border-stone-200/60 bg-[#f7f4ef] lg:block"
        aria-label="日常恢复侧栏"
      >
        <DailyRecoveryPanel
          className="h-full border-l-0"
          onProgressChanged={() => {
            void loadProgress();
          }}
        />
      </aside>

      <div className="pointer-events-none fixed bottom-5 left-4 z-40 hidden lg:block lg:left-5">
        <div className="pointer-events-auto flex items-end gap-2">
          <ProgressPlantAndLetters
            density="floating"
            stage={progressStage}
            hasUnread={progressHasUnread}
            onOpenLetters={() => setProgressPanelOpen(true)}
            onOpenLatestUnread={openLatestUnreadLetter}
          />
          {progressHasUnread ? (
            <p className="pointer-events-none pb-1 pr-1 text-[11px] leading-snug text-stone-600">
              收到一封你的来信，请查收～
            </p>
          ) : null}
        </div>
      </div>

      {panelOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/20 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => {
            if (!currentStateRequired) setPanelOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="current-state-title"
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[min(85dvh,32rem)] sm:rounded-2xl sm:pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 id="current-state-title" className="text-base font-medium text-stone-800">
                更新当前状态
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!currentStateRequired) setPanelOpen(false);
                }}
                disabled={currentStateRequired}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-700"
              >
                关闭
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <MultiSelectOptionGroupWithOther
                name="emotional"
                selectedValues={draftCurrentState.emotional}
                onToggleValue={(v) => {
                  setDraftCurrentState((d) => {
                    const has = d.emotional.includes(v);
                    const next = has
                      ? d.emotional.filter((x) => x !== v)
                      : [...d.emotional, v];
                    return {
                      ...d,
                      emotional: next,
                      emotionalOther: v === "其他" && has ? "" : d.emotionalOther,
                    };
                  });
                }}
                options={EMOTIONAL_OPTIONS}
                legend="你现在情绪是怎么样的呢？"
                otherText={draftCurrentState.emotionalOther}
                onOtherTextChange={(v) =>
                  setDraftCurrentState((d) => ({ ...d, emotionalOther: v }))
                }
                otherPlaceholder="比如：我有点怕被发现/我不知道怎么办……"
              />
              <MultiSelectOptionGroupWithOther
                name="physical"
                selectedValues={draftCurrentState.physical}
                onToggleValue={(v) => {
                  setDraftCurrentState((d) => {
                    const has = d.physical.includes(v);
                    const next = has
                      ? d.physical.filter((x) => x !== v)
                      : [...d.physical, v];
                    return {
                      ...d,
                      physical: next,
                      physicalOther: v === "其他" && has ? "" : d.physicalOther,
                    };
                  });
                }}
                options={PHYSICAL_OPTIONS}
                legend="你现在身体感受是怎么样的呢？"
                otherText={draftCurrentState.physicalOther}
                onOtherTextChange={(v) =>
                  setDraftCurrentState((d) => ({ ...d, physicalOther: v }))
                }
                otherPlaceholder="比如：我胃/睡眠/身体紧绷……"
              />
              <MultiSelectOptionGroupWithOther
                name="spatial"
                selectedValues={draftCurrentState.spatial}
                onToggleValue={(v) => {
                  setDraftCurrentState((d) => {
                    const has = d.spatial.includes(v);
                    const next = has
                      ? d.spatial.filter((x) => x !== v)
                      : [...d.spatial, v];
                    return {
                      ...d,
                      spatial: next,
                      spatialOther: v === "其他" && has ? "" : d.spatialOther,
                    };
                  });
                }}
                options={SPATIAL_OPTIONS}
                legend="你现在在哪里呢？"
                otherText={draftCurrentState.spatialOther}
                onOtherTextChange={(v) =>
                  setDraftCurrentState((d) => ({ ...d, spatialOther: v }))
                }
                otherPlaceholder="比如：我在公司/在宿舍/在路上……"
              />

              <button
                type="button"
                disabled={saving}
                onClick={handleSaveCurrentState}
                className="mt-1 w-full rounded-2xl bg-stone-600 py-3 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 active:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "保存中…" : "保存当前状态"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dailyRecoveryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/20 p-0 sm:items-center sm:p-4 lg:hidden"
          role="presentation"
          onClick={() => setDailyRecoveryOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="日常恢复"
            className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] shadow-xl sm:max-h-[88dvh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <DailyRecoveryPanel
              className="max-h-[min(92dvh,40rem)] border-0 sm:max-h-[88dvh]"
              onRequestClose={() => setDailyRecoveryOpen(false)}
              onProgressChanged={() => {
                void loadProgress();
              }}
            />
          </div>
        </div>
      ) : null}

      {feedbackOpen && feedbackMessage ? (
        <div
          className="fixed inset-0 z-[52] flex items-end justify-center bg-stone-900/20 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => {
            if (!feedbackSubmitting) closeFeedbackPanel();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-panel-title"
            className="max-h-[min(88dvh,28rem)] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] p-4 shadow-xl sm:max-h-[85dvh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span id="feedback-panel-title" className="text-sm font-medium text-stone-800">
                反馈
              </span>
              <button
                type="button"
                disabled={feedbackSubmitting}
                onClick={closeFeedbackPanel}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-700 disabled:opacity-50"
              >
                取消
              </button>
            </div>

            <p className="mb-3 text-[15px] leading-relaxed text-stone-600">
              你可以告诉我，刚才那句话哪里不太合适。
            </p>

            <p className="mb-3 text-[12px] leading-relaxed text-stone-500">
              你可以多选几项，更贴近你的感受就选它们。
            </p>

            {feedbackFormError ? (
              <p className="mb-2 text-xs text-red-700" role="alert">
                {feedbackFormError}
              </p>
            ) : null}

            <MultiSelectOptionGroupWithOther
              name="feedback-reason"
              selectedValues={feedbackReasons}
              onToggleValue={(v) => {
                setFeedbackReasons((prev) => {
                  const has = prev.includes(v);
                  const next = has ? prev.filter((x) => x !== v) : [...prev, v];
                  return next;
                });
                setFeedbackFormError(null);
              }}
              options={FEEDBACK_REASONS}
              legend="选择不合适的原因"
              otherText={feedbackOtherText}
              onOtherTextChange={(v) => {
                setFeedbackOtherText(v);
                setFeedbackFormError(null);
              }}
              otherPlaceholder="比如：哪里让你觉得太审问了/没理解你的重点……"
            />

            <button
              type="button"
              disabled={feedbackSubmitting}
              onClick={handleFeedbackSubmit}
              className="mt-4 w-full rounded-2xl bg-stone-600 py-3 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 active:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {feedbackSubmitting ? "提交中…" : "提交反馈"}
            </button>
          </div>
        </div>
      ) : null}

      <ProgressPanel
        open={progressPanelOpen}
        letters={progressLetters}
        onClose={() => setProgressPanelOpen(false)}
        onOpenLetter={openLetterById}
      />
      <ProgressLetterReader letter={selectedLetter} onClose={() => setSelectedLetter(null)} />
      {diaryOpen ? (
        <DiaryModal
          onClose={() => setDiaryOpen(false)}
          onSaved={() => {
            void loadProgress();
            window.setTimeout(() => {
              void loadProgress();
            }, 3000);
          }}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-[60] max-w-[min(calc(100vw-2rem),24rem)] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-sm shadow-lg lg:bottom-[calc(1.25rem+env(safe-area-inset-bottom))] ${
            toast.kind === "success"
              ? "border-emerald-200/80 bg-emerald-50/95 text-emerald-900"
              : "border-red-200/80 bg-red-50/95 text-red-900"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
