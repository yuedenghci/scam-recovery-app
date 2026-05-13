"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { AssistantTypingDots } from "@/components/chat/AssistantTypingDots";
import { DailyRecoveryPanel } from "@/app/chat/DailyRecoveryPanel";
import { getShanghaiDayKey } from "@/lib/dayKey";
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
  mode?: string | null;
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

/** Shown in the assistant bubble when a stream fails before usable text arrives. */
const ASSISTANT_STREAM_FAIL_HINT = "可以再说一次吗";

function lastSubstantiveAssistantMessage(
  messages: readonly ChatMessage[],
): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.text.trim() !== "") return m;
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

type SseHandler = {
  onDelta?: (text: string) => void;
  onDone?: (data: unknown) => void;
  onError?: (data: unknown) => void;
};

/**
 * Parse SSE from a fetch body (same framing as `/api/chat`).
 * Returns whether a terminal `done` event was seen.
 */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  handlers: SseHandler,
): Promise<{ sawDone: boolean; terminal: "done" | "error" | null }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;
  let terminal: "done" | "error" | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const rawEvent of events) {
        const lines = rawEvent.split("\n");
        const eventLine = lines.find((line) => line.startsWith("event: "));
        const dataLine = lines.find((line) => line.startsWith("data: "));
        if (!eventLine || !dataLine) continue;
        const event = eventLine.replace("event: ", "").trim();
        let data: unknown;
        try {
          data = JSON.parse(dataLine.replace("data: ", ""));
        } catch {
          continue;
        }
        if (event === "delta") {
          const delta =
            typeof data === "object" &&
            data !== null &&
            "text" in data &&
            typeof (data as { text: unknown }).text === "string"
              ? (data as { text: string }).text
              : "";
          if (delta) handlers.onDelta?.(delta);
        }
        if (event === "done") {
          sawDone = true;
          terminal = "done";
          handlers.onDone?.(data);
        }
        if (event === "error") {
          terminal = "error";
          handlers.onError?.(data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { sawDone, terminal };
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
  otherOptionLabel = "其他",
}: {
  name: string;
  selectedValues: readonly string[];
  onToggleValue: (v: string) => void;
  options: readonly string[];
  legend: string;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  otherPlaceholder: string;
  /** Option chip that opens the free-text field (e.g. "其他" or "其他地方"). */
  otherOptionLabel?: string;
}) {
  const showOther = selectedValues.includes(otherOptionLabel);

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
            {otherOptionLabel === "其他地方" ? "具体位置" : "其他（你可以自由补充）"}
          </label>
          <textarea
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            rows={3}
            placeholder={otherPlaceholder}
            className="w-full resize-none rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)] sm:text-[15px]"
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
  otherOptionLabel: string = "其他",
): { selected: string[]; otherText: string } {
  const tokens = stored
    .split("、")
    .map((s) => s.trim())
    .filter(Boolean);
  if (tokens.length === 0) return { selected: [], otherText: "" };

  const known = new Set(knownOptions.filter((x) => x !== otherOptionLabel));
  const selected: string[] = [];
  const otherTokens: string[] = [];

  for (const t of tokens) {
    if (known.has(t)) selected.push(t);
    else otherTokens.push(t);
  }

  const otherText = otherTokens.join("、");
  if (otherText) selected.push(otherOptionLabel);
  return { selected, otherText };
}

function formatMultiValueForStorage(
  selected: readonly string[],
  otherText: string,
  otherOptionLabel: string = "其他",
): string {
  const trimmedOther = otherText.trim();
  const withoutOther = selected.filter((x) => x !== otherOptionLabel);

  if (selected.includes(otherOptionLabel)) {
    return [...withoutOther, trimmedOther].filter(Boolean).join("、");
  }
  return withoutOther.join("、");
}

export default function ChatPage() {
  const router = useRouter();
  const [dailyRecoveryOpen, setDailyRecoveryOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [currentStateLoaded, setCurrentStateLoaded] = useState(false);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [onboardingEnsureDone, setOnboardingEnsureDone] = useState(false);
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
  const chatScrollRaf = useRef<number | null>(null);
  const prevSavedCurrentStateRef = useRef<CurrentStateSaved>(EMPTY_CURRENT_STATE_SAVED);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputTextRef = useRef("");
  const proactiveFetchStartedRef = useRef(false);

  const latestAssistant = lastSubstantiveAssistantMessage(messages);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    prevSavedCurrentStateRef.current = savedCurrentState;
  }, [savedCurrentState]);

  useEffect(() => {
    if (chatScrollRaf.current != null) {
      cancelAnimationFrame(chatScrollRaf.current);
    }
    chatScrollRaf.current = requestAnimationFrame(() => {
      chatScrollRaf.current = null;
      const el = chatScrollAreaRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
    return () => {
      if (chatScrollRaf.current != null) {
        cancelAnimationFrame(chatScrollRaf.current);
        chatScrollRaf.current = null;
      }
    };
  }, [messages, loading]);

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

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/chat/history");
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          messages?: unknown;
        };
        if (!res.ok) return;

        const raw = Array.isArray(data.messages) ? data.messages : [];
        const mapped: ChatMessage[] = [];
        for (const item of raw) {
          if (typeof item !== "object" || item === null) continue;
          const o = item as Record<string, unknown>;
          const id = typeof o.id === "string" ? o.id : "";
          const role = o.role;
          const text = typeof o.text === "string" ? o.text : "";
          if (!id || (role !== "user" && role !== "assistant") || text === "") continue;
          const suggestedRaw = o.suggestedAction;
          const suggestedAction =
            typeof suggestedRaw === "string" && suggestedRaw.trim() !== ""
              ? suggestedRaw.trim()
              : null;
          const modeRaw = o.mode;
          const mode =
            typeof modeRaw === "string" && modeRaw.trim() !== ""
              ? modeRaw.trim()
              : null;
          mapped.push({
            id,
            role,
            text,
            ...(suggestedAction ? { suggestedAction } : {}),
            ...(mode ? { mode } : {}),
          });
        }

        if (mapped.length > 0) {
          setMessages(mapped);
        }
      } catch {
        // Fallback: greeting effect runs after `chatHistoryLoaded`.
      } finally {
        setChatHistoryLoaded(true);
      }

      try {
        const r2 = await fetch("/api/chat/ensure-onboarding-greeting", {
          method: "POST",
        });
        const j2 = (await r2.json().catch(() => ({}))) as {
          ok?: boolean;
          created?: boolean;
          message?: { id?: string; role?: string; text?: string };
        };
        if (
          r2.ok &&
          j2.created &&
          j2.message &&
          typeof j2.message.id === "string" &&
          j2.message.role === "assistant" &&
          typeof j2.message.text === "string" &&
          j2.message.text.trim() !== ""
        ) {
          const id = j2.message.id;
          const text = j2.message.text;
          setMessages((prev) => {
            if (prev.some((m) => m.id === id)) return prev;
            return [
              ...prev,
              {
                id,
                role: "assistant" as const,
                text,
                mode: "onboarding_greeting",
              },
            ];
          });
        }
      } catch {
        // Non-fatal: proactive / greeting logic stays conservative.
      } finally {
        setOnboardingEnsureDone(true);
      }
    })();
  }, []);

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

  const openFeedbackForLatestAssistant = useCallback(() => {
    const target = lastSubstantiveAssistantMessage(messages);
    if (!target) return;
    setFeedbackMessage(target);
    setFeedbackReasons([]);
    setFeedbackOtherText("");
    setFeedbackFormError(null);
    setFeedbackOpen(true);
  }, [messages]);

  useEffect(() => {
    if (!chatHistoryLoaded || !onboardingEnsureDone || panelOpen) return;

    const run = async () => {
      await Promise.resolve();
      if (inputTextRef.current.trim() !== "") return;
      if (proactiveFetchStartedRef.current) return;
      proactiveFetchStartedRef.current = true;

      try {
        const res = await fetch("/api/proactive-opening", { method: "POST" });
        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
          try {
            await res.json();
          } catch {
            /* ignore */
          }
          return;
        }

        if (!res.ok || !contentType.includes("text/event-stream") || !res.body) {
          return;
        }

        const localAssistantId = `local-assistant-${generateLocalChatMessageId()}`;
        setMessages((prev) => [
          ...prev,
          { id: localAssistantId, role: "assistant", text: "" },
        ]);

        const { sawDone, terminal } = await readSseStream(res.body, {
          onDelta: (text) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === localAssistantId
                  ? { ...m, text: m.text + text }
                  : m,
              ),
            );
          },
          onDone: (data) => {
            const payload = data as { messageId?: string };
            const mid =
              typeof payload.messageId === "string"
                ? payload.messageId.trim()
                : "";
            if (!mid) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === localAssistantId
                  ? { ...m, id: mid, mode: "proactive_opening" }
                  : m,
              ),
            );
          },
        });

        if (!sawDone || terminal === "error") {
          setMessages((prev) => {
            const t = prev.find((m) => m.id === localAssistantId);
            if (!t) return prev;
            if (t.text.trim() === "") {
              return prev.filter((m) => m.id !== localAssistantId);
            }
            return prev.map((m) =>
              m.id === localAssistantId
                ? { ...m, text: ASSISTANT_STREAM_FAIL_HINT }
                : m,
            );
          });
        }
      } catch {
        /* ignore */
      }
    };

    void run();
  }, [chatHistoryLoaded, onboardingEnsureDone, panelOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setErrorMessage(null);

    const userMsg: ChatMessage = {
      id: `local-${generateLocalChatMessageId()}`,
      role: "user",
      text: trimmed,
    };
    const localAssistantId = `local-assistant-${generateLocalChatMessageId()}`;

    try {
      setLoading(true);

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: localAssistantId, role: "assistant", text: "" },
      ]);
      setInputText("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const contentType = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        try {
          await res.json();
        } catch {
          // ignore
        }
        setErrorMessage(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localAssistantId
              ? { ...m, text: ASSISTANT_STREAM_FAIL_HINT }
              : m,
          ),
        );
        return;
      }

      if (!contentType.includes("text/event-stream") || !res.body) {
        setErrorMessage(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localAssistantId
              ? { ...m, text: ASSISTANT_STREAM_FAIL_HINT }
              : m,
          ),
        );
        return;
      }

      try {
        const { sawDone, terminal } = await readSseStream(res.body, {
          onDelta: (delta) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.id === localAssistantId ? { ...m, text: m.text + delta } : m,
              ),
            ),
          onDone: (data) => {
            const d = data as {
              messageId?: unknown;
              suggestedAction?: unknown;
            };
            const resolvedId =
              typeof d.messageId === "string" ? d.messageId : null;

            const sug =
              typeof d.suggestedAction === "string" &&
              d.suggestedAction.trim() !== ""
                ? d.suggestedAction.trim()
                : null;

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== localAssistantId) return m;

                const nextId = resolvedId ?? m.id;
                if (sug) {
                  return {
                    id: nextId,
                    role: "assistant" as const,
                    text: m.text,
                    suggestedAction: sug,
                  };
                }
                return {
                  id: nextId,
                  role: "assistant" as const,
                  text: m.text,
                };
              }),
            );

            const assistantDbId =
              typeof resolvedId === "string" && resolvedId.trim() !== ""
                ? resolvedId.trim()
                : null;
            // Poll DB for async suggestedAction: t+2s, then once more at t+5s if still missing.
            if (assistantDbId) {
              let suggestedFilled = false;
              const fetchSuggestedFromDb = async () => {
                try {
                  const r = await fetch(
                    `/api/chat/message?messageId=${encodeURIComponent(assistantDbId)}`,
                  );
                  if (!r.ok) return;
                  const payload = (await r.json().catch(() => ({}))) as {
                    ok?: boolean;
                    suggestedAction?: string | null;
                  };
                  const nextSug =
                    typeof payload.suggestedAction === "string"
                      ? payload.suggestedAction.trim()
                      : "";
                  if (!nextSug) return;
                  if (suggestedFilled) return;
                  suggestedFilled = true;
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== assistantDbId) return m;
                      if (m.role !== "assistant") return m;
                      return { ...m, suggestedAction: nextSug };
                    }),
                  );
                } catch {
                  // Non-fatal: suggestedAction may still be processing.
                }
              };
              window.setTimeout(() => {
                void fetchSuggestedFromDb();
              }, 2000);
              window.setTimeout(() => {
                if (suggestedFilled) return;
                void fetchSuggestedFromDb();
              }, 5000);
            }
          },
          onError: () => {
            setErrorMessage(null);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === localAssistantId
                  ? {
                      ...m,
                      text: m.text.trim() || ASSISTANT_STREAM_FAIL_HINT,
                    }
                  : m,
              ),
            );
          },
        });

        if (!sawDone && terminal !== "error") {
          setErrorMessage(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === localAssistantId
                ? {
                    ...m,
                    text: m.text.trim() || ASSISTANT_STREAM_FAIL_HINT,
                  }
                : m,
            ),
          );
        }
      } catch {
        setErrorMessage(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localAssistantId
              ? { ...m, text: m.text.trim() || ASSISTANT_STREAM_FAIL_HINT }
              : m,
          ),
        );
      }
    } catch {
      setErrorMessage(null);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localAssistantId
            ? { ...m, text: m.text.trim() || ASSISTANT_STREAM_FAIL_HINT }
            : m,
        ),
      );
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
      "其他地方",
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

    const snapshot = {
      messageId: feedbackMessage.id,
      assistantReplyText: feedbackMessage.text,
      selectedReasons: [...feedbackReasons],
      otherText: includesOther ? feedbackOtherText.trim() : "",
    };

    closeFeedbackPanel();
    showToast("success", "收到反馈，我会按照这个调整。");

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: snapshot.messageId,
          selectedReasons: snapshot.selectedReasons,
          otherText: snapshot.otherText,
          assistantReplyText: snapshot.assistantReplyText,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || data.ok === false) {
        const message =
          typeof data.error === "string" && data.error
            ? data.error
            : "提交失败，请稍后再试";
        showToast("error", message);
      }
    } catch {
      showToast("error", "提交失败，请稍后再试");
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
    const needSpatialOther = spatial.includes("其他地方");

    if (needEmotionalOther && !emotionalOtherTrim) {
      showToast("error", "情绪选了“其他”，请先写下你的感受");
      return;
    }
    if (needPhysicalOther && !physicalOtherTrim) {
      showToast("error", "身体感受选了“其他”，请先写下来");
      return;
    }
    if (needSpatialOther && !spatialOtherTrim) {
      showToast("error", "位置选了“其他地方”，请先写下你在哪里");
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
    const spatialStored = formatMultiValueForStorage(
      spatial,
      spatialOtherTrim,
      "其他地方",
    );

    const previousSaved = prevSavedCurrentStateRef.current;
    setSavedCurrentState({
      emotional: emotionalStored,
      physical: physicalStored,
      spatial: spatialStored,
    });
    setCurrentStateRequired(false);
    setCurrentStateLastSavedAt(new Date().toISOString());
    setPanelOpen(false);
    showToast("success", "当前状态已保存");
    setSaving(false);

    void (async () => {
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
          let message = "保存失败，请稍后重试";
          try {
            const data = (await res.json()) as { error?: string };
            if (typeof data.error === "string" && data.error) message = data.error;
          } catch {
            /* ignore */
          }
          throw new Error(message);
        }
        window.setTimeout(() => {
          void loadProgress();
        }, 10000);
      } catch (e) {
        setSavedCurrentState(previousSaved);
        setCurrentStateRequired(true);
        setPanelOpen(true);
        showToast(
          "error",
          e instanceof Error ? e.message : "保存失败，请稍后重试",
        );
      }
    })();
  }, [draftCurrentState, loadProgress, showToast]);

  useEffect(() => {
    // 进入 support AI 页面后：如果当天还没填过当前状态，就必须先弹窗填写。
    void (async () => {
      try {
        const res = await fetch("/api/current-state");
        const data = (await res.json()) as {
          ok?: boolean;
          isToday?: boolean;
          currentState?: null | {
            emotional: string | null;
            physical: string | null;
            spatial: string | null;
            createdAt: string;
          };
        };

        if (!res.ok || data.ok === false) {
          setCurrentStateLoaded(true);
          setCurrentStateRequired(true);
          setPanelOpen(true);
          return;
        }

        const typedData = data;
        const cs = typedData.currentState ?? null;
        if (cs) {
          setSavedCurrentState({
            emotional: cs.emotional ?? "",
            physical: cs.physical ?? "",
            spatial: cs.spatial ?? "",
          });
          setCurrentStateLastSavedAt(typeof cs.createdAt === "string" ? cs.createdAt : null);

          let required = true;
          if (typeof typedData.isToday === "boolean") {
            required = !typedData.isToday;
          } else if (typeof cs.createdAt === "string") {
            required =
              getShanghaiDayKey(new Date(cs.createdAt)) !== getShanghaiDayKey(new Date());
          }

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
    if (!moreMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const panel = moreMenuPanelRef.current;
      const btn = moreMenuButtonRef.current;
      const node = e.target;
      if (node instanceof Node && panel?.contains(node)) return;
      if (node instanceof Node && btn?.contains(node)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!currentStateLoaded || !chatHistoryLoaded || !onboardingEnsureDone) return;
    if (panelOpen) return;
    if (messages.length !== 0) return;
    // 先自然打招呼，再让用户开始聊。
    setMessages([
      { id: "assistant-greeting-local", role: "assistant", text: "嗨，今天想从哪里开始聊呢？" },
    ]);
  }, [currentStateLoaded, chatHistoryLoaded, onboardingEnsureDone, panelOpen, messages.length]);

  return (
    <div
      lang="zh-CN"
      className="flex h-dvh min-h-dvh flex-col bg-[#f7f4ef] text-stone-800 lg:flex-row"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-stone-200/60 bg-[#fbf9f5]/90 px-2 py-1.5 sm:px-3 sm:py-2 lg:px-4 lg:py-2.5">
        <div className="mx-auto max-w-lg">
          <div className="grid grid-cols-4 gap-1.5 lg:flex lg:flex-nowrap lg:justify-start lg:gap-2 lg:overflow-x-auto lg:pb-px [scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={openDailyRecoveryMobileOrFocusSidebar}
              className="flex min-h-[44px] min-w-0 max-lg:min-h-[40px] items-center justify-center whitespace-nowrap rounded-xl border border-stone-200/85 bg-white/80 px-1.5 max-lg:px-1 text-[13px] font-medium leading-tight text-stone-700 shadow-[0_1px_0_rgba(255,255,255,0.65)] max-lg:text-[11px] max-lg:leading-snug max-lg:shadow-none transition-colors active:bg-stone-100/90 lg:min-h-0 lg:shrink-0 lg:rounded-full lg:px-2.5 lg:py-1 lg:text-xs lg:text-stone-600"
            >
              日常恢复
            </button>
            <button
              type="button"
              onClick={() => setDiaryOpen(true)}
              className="flex min-h-[44px] min-w-0 max-lg:min-h-[40px] items-center justify-center whitespace-nowrap rounded-xl border border-stone-200/85 bg-white/80 px-1.5 max-lg:px-1 text-[13px] font-medium leading-tight text-stone-700 shadow-[0_1px_0_rgba(255,255,255,0.65)] max-lg:text-[11px] max-lg:leading-snug max-lg:shadow-none transition-colors active:bg-stone-100/90 lg:min-h-0 lg:shrink-0 lg:rounded-full lg:px-2.5 lg:py-1 lg:text-xs lg:text-stone-600"
            >
              写日记
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="flex min-h-[44px] min-w-0 max-lg:min-h-[40px] items-center justify-center whitespace-nowrap rounded-xl border border-stone-200/85 bg-white/80 px-1.5 max-lg:px-1 text-[13px] font-medium leading-tight text-stone-700 shadow-[0_1px_0_rgba(255,255,255,0.65)] max-lg:text-[11px] max-lg:leading-snug max-lg:shadow-none transition-colors active:bg-stone-100/90 lg:min-h-0 lg:shrink-0 lg:rounded-full lg:px-2.5 lg:py-1 lg:text-xs lg:text-stone-600"
            >
              当前状态
            </button>
            <div className="relative z-[140] flex max-lg:min-h-[40px] min-h-[44px] min-w-0 justify-center lg:flex lg:w-auto lg:min-h-0 lg:shrink-0 lg:justify-start">
              <button
                ref={moreMenuButtonRef}
                type="button"
                aria-label="更多"
                aria-expanded={moreMenuOpen}
                aria-haspopup="menu"
                className="flex h-[44px] min-h-[44px] max-lg:h-10 max-lg:min-h-10 w-full max-w-none min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-stone-200/85 bg-white/80 px-1.5 text-[17px] font-semibold leading-none text-stone-500 shadow-[0_1px_0_rgba(255,255,255,0.65)] max-lg:shadow-none transition-colors active:bg-stone-100/90 lg:h-auto lg:w-auto lg:min-h-0 lg:min-w-0 lg:rounded-full lg:px-2 lg:py-1 lg:text-[14px]"
                onClick={(e) => {
                  e.stopPropagation();
                  setMoreMenuOpen((o) => !o);
                }}
              >
                ⋯
              </button>
              {moreMenuOpen ? (
                <div
                  ref={moreMenuPanelRef}
                  role="menu"
                  aria-label="更多操作"
                  className="absolute right-0 top-[calc(100%+6px)] z-[200] min-w-[11rem] rounded-xl border border-stone-200/80 bg-[#fbf9f5]/98 py-1 text-left text-[15px] shadow-xl backdrop-blur-md"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-4 py-3 text-left font-medium text-stone-700 transition-colors hover:bg-stone-200/40 active:bg-stone-200/55"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      router.push("/onboarding");
                    }}
                  >
                    修改支持设定
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-4 py-3 text-left font-medium text-stone-700 transition-colors hover:bg-stone-200/40 active:bg-stone-200/55"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      void handleLogout();
                    }}
                  >
                    退出
                  </button>
                </div>
              ) : null}
            </div>
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
                  {msg.text.trim() === "" ? (
                    <>
                      <span className="sr-only">对方正在输入</span>
                      <AssistantTypingDots variant="chatBubble" />
                    </>
                  ) : (
                    msg.text
                  )}
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
        className="shrink-0 border-0 bg-[#f7f4ef] shadow-none ring-0 px-2 pb-[max(10px,calc(env(safe-area-inset-bottom)+10px))] pt-3 sm:px-3 lg:border-t lg:border-stone-200/60 lg:bg-[#fbf9f5]/92 lg:px-4 lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pt-3 lg:backdrop-blur-sm [--chat-input-height:92px]"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          <div className="flex items-end gap-1 lg:gap-3">
            <div className="relative -ml-5 h-[92px] w-[96px] shrink-0 overflow-visible lg:hidden">
              <div className="absolute bottom-0 left-0">
                <ProgressPlantAndLetters
                  density="composer"
                  stage={progressStage}
                  hasUnread={progressHasUnread}
                  onOpenLetters={() => setProgressPanelOpen(true)}
                />
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 items-end gap-1 lg:gap-3">
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
                className="max-lg:shadow-sm min-h-[48px] min-w-0 flex-1 rounded-2xl border border-stone-200/85 bg-white/95 px-4 py-3 text-base text-stone-800 placeholder:text-stone-400 outline-none ring-0 transition-shadow focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.12)] lg:border-stone-200/80 lg:bg-white lg:text-[15px]"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={loading}
                className="min-h-[48px] min-w-[3.75rem] shrink-0 rounded-2xl bg-stone-600 px-3.5 py-3 text-[15px] font-semibold text-stone-50 transition-colors hover:bg-stone-700 active:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 max-lg:active:scale-[0.98] sm:min-w-[4rem] sm:px-4 lg:min-h-0 lg:text-sm lg:font-medium"
                aria-busy={loading || undefined}
                aria-label={loading ? "对方正在输入" : "发送"}
              >
                发送
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
            window.setTimeout(() => {
              void loadProgress();
            }, 10000);
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
          />
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
                otherPlaceholder="可以写下你现在更贴近的感受"
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
                otherPlaceholder="可以写下你现在的身体感受"
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
                      spatialOther: v === "其他地方" && has ? "" : d.spatialOther,
                    };
                  });
                }}
                options={SPATIAL_OPTIONS}
                legend="你现在在哪里呢？"
                otherText={draftCurrentState.spatialOther}
                onOtherTextChange={(v) =>
                  setDraftCurrentState((d) => ({ ...d, spatialOther: v }))
                }
                otherPlaceholder="可以写下你现在所在的地方"
                otherOptionLabel="其他地方"
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
                window.setTimeout(() => {
                  void loadProgress();
                }, 10000);
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
            closeFeedbackPanel();
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
                onClick={closeFeedbackPanel}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-stone-500 transition-colors hover:bg-stone-200/50 hover:text-stone-700"
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
              onClick={() => void handleFeedbackSubmit()}
              className="mt-4 w-full rounded-2xl bg-stone-600 py-3 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 active:bg-stone-800"
            >
              提交反馈
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
            window.setTimeout(() => {
              void loadProgress();
            }, 10000);
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
