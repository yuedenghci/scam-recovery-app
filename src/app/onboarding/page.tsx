"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { AssistantTypingDots } from "@/components/chat/AssistantTypingDots";
import { SupportContextPanel } from "@/components/onboarding/SupportContextPanel";
import {
  ENDING_TEXT,
  OPENING_TEXT,
  type QuestionNode,
  type RightPanelKey,
  QUESTIONS,
  RIGHT_PANEL_MODULES,
} from "@/lib/onboardingFlow";

type ChatRole = "ai" | "user";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  kind?: "opening" | "question" | "summary" | "tip" | "ending" | "typing";
  questionId?: string;
};

type SummaryDraft = {
  questionId: string;
  moduleKey: RightPanelKey;
  text: string;
  points: string[];
};

type StepAuditItem = {
  questionId: string;
  moduleKey: RightPanelKey;
  rawAnswer: string;
  aiSummary: string;
  revisionCount: number;
  skipped: boolean;
  confirmed: boolean;
};

type QuestionProgress = {
  userAnswers: string[];
  summary: string;
  revisionCount: number;
};

type FlyingStar = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  active: boolean;
};

const STAR_PAUSE_MS = 700;
const STAR_FLY_MS = 2600;
const STAR_TOAST_MS = 5200;
const NEXT_QUESTION_DELAY_MS = 2000;
const OPENING_TRANSITION_MS = 220;
const POST_STAR_SCROLL_HIGHLIGHT_MS = 1800;
/** Mobile: wait for bottom sheet open + scroll before measuring star end point */
const MOBILE_SHEET_OPEN_MS = 380;
const MOBILE_SCROLL_THEN_STAR_MS = 480;

/** Last step only: collapsible reference chips in the input footer (UI only). */
const LAST_ONBOARDING_QUESTION_INDEX = QUESTIONS.length - 1;
const LAST_QUESTION_HINT_INITIAL_VISIBLE_CHIPS = 3;

function skipTypingDurationMs() {
  return 600 + Math.floor(Math.random() * 401);
}

const SKIP_CONFIRM_BODY =
  "这部分先跳过没关系，不过这可能会影响后面我对你的理解和陪伴体验。";

function createMessage(
  role: ChatRole,
  text: string,
  extra?: Partial<Pick<ChatMessage, "kind" | "questionId">>,
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    text,
    ...extra,
  };
}

function toPointLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

function clientSummaryFallback(
  question: QuestionNode,
  userAnswer: string,
): { chatSummary: string; bullets: string[]; proactivePreference?: "passive" | "moderate" | "active" } {
  const compact = userAnswer.replace(/\s+/g, " ").trim();
  const proactiveExtra =
    question.rightPanelKey === "proactiveLevel"
      ? ({ proactivePreference: "moderate" as const } as const)
      : {};
  if (!compact) {
    return {
      chatSummary:
        "我先把这一题记成：描述还比较少，你之后有想法我们再慢慢补。",
      bullets: ["目前细节较少，可后续补充"],
      ...proactiveExtra,
    };
  }
  const short = compact.length > 90 ? `${compact.slice(0, 88).trim()}…` : compact;
  return {
    chatSummary: `听起来你刚刚在说的重点我接住了。\n我先记一下：${short}\n之后你想再微调，我们可以继续改。`,
    bullets: [short],
    ...proactiveExtra,
  };
}

function useLg() {
  const [lg, setLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setLg(mq.matches);
    const f = () => setLg(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return lg;
}

function buildCombinedAnswer(answers: string[]): string {
  if (answers.length <= 1) return answers[0] ?? "";
  return answers
    .map((answer, index) => `第${index + 1}轮回答：${answer}`)
    .join("\n");
}

/** Assistant-side bubbles (summary stream, typing, question transition) share one shell */
const ONBOARDING_ASSISTANT_BUBBLE =
  "max-w-[92%] rounded-2xl rounded-tl-md border border-stone-200/80 bg-orange-50/35 px-3.5 py-2.5 text-[15px] leading-relaxed text-stone-900/90 shadow-sm sm:max-w-[85%]";

function AiThinkingDots() {
  return (
    <div className={`flex items-center ${ONBOARDING_ASSISTANT_BUBBLE}`}>
      <AssistantTypingDots variant="onboarding" className="py-0.5" />
    </div>
  );
}

/** Right-panel field editable once this question step was completed (answered or skipped). */
function deriveAiFilledFromAudit(
  audit: StepAuditItem[],
): Partial<Record<RightPanelKey, boolean>> {
  const out: Partial<Record<RightPanelKey, boolean>> = {};
  for (const row of audit) {
    if (row.confirmed) {
      out[row.moduleKey] = true;
    }
  }
  return out;
}

/** Returning users: unlock fields that already have persisted content. */
function mergeAiFilledFromPersisted(
  base: Partial<Record<RightPanelKey, boolean>>,
  content: Record<RightPanelKey, string>,
): Partial<Record<RightPanelKey, boolean>> {
  const out = { ...base };
  (Object.keys(content) as RightPanelKey[]).forEach((k) => {
    if (content[k]?.trim()) out[k] = true;
  });
  return out;
}

export default function OnboardingPage() {
  const isLg = useLg();
  const router = useRouter();
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openingAcknowledged, setOpeningAcknowledged] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [draftInput, setDraftInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [summaryDraft, setSummaryDraft] = useState<SummaryDraft | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [revisionCount, setRevisionCount] = useState(0);
  const [awaitingRevisionCapAck, setAwaitingRevisionCapAck] = useState(false);
  const [showOpeningButton, setShowOpeningButton] = useState(true);
  const [revisionContextSummary, setRevisionContextSummary] = useState<
    string | undefined
  >();

  const [rightPanelContent, setRightPanelContent] = useState<
    Record<RightPanelKey, string>
  >({
    scamSituation: "",
    scamImpact: "",
    personality: "",
    likedActivities: "",
    expectedRole: "",
    toneStyle: "",
    proactiveLevel: "",
    helpGoals: "",
  });
  const [manualEditedModules, setManualEditedModules] = useState<
    Partial<Record<RightPanelKey, boolean>>
  >({});
  /** passive | moderate | active，与 proactiveLevel 文案同步 */
  const [proactivePreference, setProactivePreference] = useState<string | null>(
    null,
  );
  /** Per right-panel key: user has passed that onboarding step (confirmed answer or skip). */
  const [aiFilledModules, setAiFilledModules] = useState<
    Partial<Record<RightPanelKey, boolean>>
  >({});
  const [highlightModule, setHighlightModule] = useState<RightPanelKey | null>(
    null,
  );
  const [flyNotice, setFlyNotice] = useState("");
  const [flyingStar, setFlyingStar] = useState<FlyingStar | null>(null);
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);
  /** Last-question hint chips: expanded vs collapsed (display only). */
  const [lastQuestionHintExpanded, setLastQuestionHintExpanded] =
    useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [isQuestionTransitioning, setIsQuestionTransitioning] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [entryPulse, setEntryPulse] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const [stepAudit, setStepAudit] = useState<StepAuditItem[]>([]);
  const [questionProgress, setQuestionProgress] = useState<
    Record<string, QuestionProgress>
  >({});

  const summaryBubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const moduleRefs = useRef<Record<RightPanelKey, HTMLDivElement | null>>({
    scamSituation: null,
    scamImpact: null,
    personality: null,
    likedActivities: null,
    expectedRole: null,
    toneStyle: null,
    proactiveLevel: null,
    helpGoals: null,
  });
  const sheetEntryRef = useRef<HTMLButtonElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingScrollRef = useRef<HTMLDivElement | null>(null);
  const onboardingScrollRaf = useRef<number | null>(null);
  const onboardingTailRef = useRef<HTMLDivElement | null>(null);
  const skipTypingTimerRef = useRef<number | null>(null);

  const firstQuestion = QUESTIONS[0];
  const currentQuestion = QUESTIONS[currentQuestionIndex] ?? null;

  const grouped = useMemo(
    () => ({
      user: RIGHT_PANEL_MODULES.filter((x) => x.group === "关于用户"),
      ai: RIGHT_PANEL_MODULES.filter((x) => x.group === "关于 AI"),
    }),
    [],
  );

  const pushAudit = useCallback((row: StepAuditItem) => {
    setStepAudit((prev) => {
      const i = prev.findIndex((p) => p.questionId === row.questionId);
      if (i < 0) return [...prev, row];
      const n = [...prev];
      n[i] = { ...n[i], ...row };
      return n;
    });
  }, []);

  const fullPersist = useCallback(
    async (override?: {
      messages: ChatMessage[];
      questionIndex: number;
      openingAck: boolean;
      isCompleted: boolean;
      audit: StepAuditItem[];
      right: Record<RightPanelKey, string>;
      manual: Partial<Record<RightPanelKey, boolean>>;
    }) => {
      const res = await fetch("/api/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            currentQuestionIndex: override?.questionIndex ?? currentQuestionIndex,
            openingAcknowledged: override?.openingAck ?? openingAcknowledged,
            isCompleted: override?.isCompleted ?? isOnboardingDone,
            chatSnapshot: (override?.messages ?? chatMessages) as object,
            stepAudit: (override?.audit ?? stepAudit) as object,
          },
          supportContext: {
            ...(override?.right ?? rightPanelContent),
            ...(proactivePreference !== null
              ? { proactivePreference }
              : {}),
            manualModuleFlags: override?.manual ?? manualEditedModules,
          },
        }),
      });
      if (!res.ok) throw new Error("put");
    },
    [
      chatMessages,
      currentQuestionIndex,
      openingAcknowledged,
      isOnboardingDone,
      rightPanelContent,
      manualEditedModules,
      proactivePreference,
      stepAudit,
    ],
  );

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/onboarding");
        if (!r.ok) throw new Error("get");
        const j = (await r.json()) as {
          ok: boolean;
          draft: {
            currentQuestionIndex: number;
            openingAcknowledged: boolean;
            isCompleted: boolean;
            chatSnapshot: unknown;
            stepAudit: unknown;
          } | null;
          supportContext:
            | ({
                manualModuleFlags?: unknown;
                proactivePreference?: string | null;
              } & Record<RightPanelKey, string>)
            | null;
        };
        if (!j.ok) throw new Error("bad");

        let restoredRight: Record<RightPanelKey, string> = {
          scamSituation: "",
          scamImpact: "",
          personality: "",
          likedActivities: "",
          expectedRole: "",
          toneStyle: "",
          proactiveLevel: "",
          helpGoals: "",
        };
        if (j.supportContext) {
          const m = j.supportContext;
          restoredRight = {
            scamSituation: m.scamSituation ?? "",
            scamImpact: m.scamImpact ?? "",
            personality: m.personality ?? "",
            likedActivities: m.likedActivities ?? "",
            expectedRole: m.expectedRole ?? "",
            toneStyle: m.toneStyle ?? "",
            proactiveLevel: m.proactiveLevel ?? "",
            helpGoals: m.helpGoals ?? "",
          };
          setRightPanelContent(restoredRight);
          const pp = j.supportContext.proactivePreference;
          setProactivePreference(
            typeof pp === "string" && ["passive", "moderate", "active"].includes(pp)
              ? pp
              : null,
          );
          if (
            m.manualModuleFlags &&
            typeof m.manualModuleFlags === "object" &&
            !Array.isArray(m.manualModuleFlags)
          ) {
            setManualEditedModules(
              m.manualModuleFlags as Partial<Record<RightPanelKey, boolean>>,
            );
          }
        } else {
          setProactivePreference(null);
        }

        if (j.draft?.stepAudit && Array.isArray(j.draft.stepAudit)) {
          const auditRows = j.draft.stepAudit as StepAuditItem[];
          setStepAudit(auditRows);
          setAiFilledModules(
            mergeAiFilledFromPersisted(
              deriveAiFilledFromAudit(auditRows),
              restoredRight,
            ),
          );
          setQuestionProgress((prev) => {
            const next = { ...prev };
            auditRows.forEach((row) => {
              const roundMatches = [...row.rawAnswer.matchAll(/第\d+轮回答：([\s\S]*?)(?=\n第\d+轮回答：|$)/g)];
              const restoredAnswers =
                roundMatches.length > 0
                  ? roundMatches
                      .map((match) => match[1]?.trim() ?? "")
                      .filter(Boolean)
                  : [];
              next[row.questionId] = {
                userAnswers:
                  restoredAnswers.length > 0
                    ? restoredAnswers
                    : row.rawAnswer.trim()
                      ? [row.rawAnswer.trim()]
                      : [],
                summary: row.aiSummary ?? "",
                revisionCount: row.revisionCount ?? 0,
              };
            });
            return next;
          });
        }

        if (j.draft?.chatSnapshot && Array.isArray(j.draft.chatSnapshot)) {
          setChatMessages(j.draft.chatSnapshot as ChatMessage[]);
          setCurrentQuestionIndex(j.draft.currentQuestionIndex ?? 0);
          setOpeningAcknowledged(!!j.draft.openingAcknowledged);
          setIsOnboardingDone(!!j.draft.isCompleted);
          setShowOpeningButton(!j.draft.openingAcknowledged);
          if (!j.draft.stepAudit || !Array.isArray(j.draft.stepAudit)) {
            setAiFilledModules(mergeAiFilledFromPersisted({}, restoredRight));
          }
        } else {
          setChatMessages([createMessage("ai", OPENING_TEXT, { kind: "opening" })]);
          setCurrentQuestionIndex(0);
          setOpeningAcknowledged(false);
          setShowOpeningButton(true);
          setAiFilledModules(
            mergeAiFilledFromPersisted({}, restoredRight),
          );
        }
        setLoadStatus("ready");
      } catch (e) {
        console.error(e);
        setLoadError("无法加载，请稍后再试");
        setLoadStatus("error");
        setChatMessages([createMessage("ai", OPENING_TEXT, { kind: "opening" })]);
        setShowOpeningButton(true);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (skipTypingTimerRef.current) clearTimeout(skipTypingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (loadStatus !== "ready") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fullPersist().catch((e) => console.warn("background save", e));
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [loadStatus, fullPersist, chatMessages, rightPanelContent, manualEditedModules, proactivePreference, stepAudit, currentQuestionIndex, openingAcknowledged, isOnboardingDone]);

  useEffect(() => {
    if (onboardingScrollRaf.current != null) {
      cancelAnimationFrame(onboardingScrollRaf.current);
    }
    onboardingScrollRaf.current = requestAnimationFrame(() => {
      onboardingScrollRaf.current = null;
      const el = onboardingScrollRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
      onboardingTailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
    return () => {
      if (onboardingScrollRaf.current != null) {
        cancelAnimationFrame(onboardingScrollRaf.current);
        onboardingScrollRaf.current = null;
      }
    };
  }, [
    chatMessages,
    isThinking,
    awaitingConfirm,
    summaryDraft,
    currentQuestion?.hintCards?.length,
    isQuestionTransitioning,
    showOpeningButton,
    currentQuestion,
    currentQuestionIndex,
    openingAcknowledged,
    isOnboardingDone,
  ]);

  useEffect(() => {
    if (currentQuestionIndex !== LAST_ONBOARDING_QUESTION_INDEX) {
      setLastQuestionHintExpanded(false);
    }
  }, [currentQuestionIndex]);

  function openNextQuestion(nextIndex: number) {
    const nextQ = QUESTIONS[nextIndex];
    if (!nextQ) {
      setChatMessages((prev) => [
        ...prev,
        createMessage("ai", ENDING_TEXT, { kind: "ending" }),
      ]);
      setIsOnboardingDone(true);
      setAwaitingConfirm(false);
      setSummaryDraft(null);
      setShowOpeningButton(false);
      return;
    }
    setChatMessages((prev) => [
      ...prev,
      createMessage("ai", nextQ.prompt, { kind: "question", questionId: nextQ.id }),
    ]);
  }

  function transitionToNextQuestion(nextIndex: number) {
    setIsQuestionTransitioning(true);
    window.setTimeout(() => {
      setCurrentQuestionIndex(nextIndex);
      openNextQuestion(nextIndex);
      setIsQuestionTransitioning(false);
    }, NEXT_QUESTION_DELAY_MS);
  }

  const triggerStar = useCallback(
    (moduleKey: RightPanelKey, questionId: string) => {
      const run = (startX: number, startY: number, endX: number, endY: number) => {
        setFlyingStar({ startX, startY, endX, endY, active: false });
        window.setTimeout(() => {
          setFlyingStar((s) => (s ? { ...s, active: true } : null));
        }, STAR_PAUSE_MS);
        window.setTimeout(() => {
          setFlyingStar(null);
          const el = moduleRefs.current[moduleKey];
          if (el && isLg) {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          setHighlightModule(moduleKey);
          window.setTimeout(
            () => setHighlightModule(null),
            POST_STAR_SCROLL_HIGHLIGHT_MS,
          );
        }, STAR_PAUSE_MS + STAR_FLY_MS);
        setFlyNotice("先帮你记在这里了，后面随时都能改。");
        window.setTimeout(() => setFlyNotice(""), STAR_TOAST_MS);
      };

      const sourceEl = summaryBubbleRefs.current[questionId];
      let startX = 40;
      let startY = 200;
      if (sourceEl) {
        const r = sourceEl.getBoundingClientRect();
        startX = r.left + r.width / 2;
        startY = r.top + r.height / 2;
      }

      if (!isLg) {
        setSheetOpen(true);
        setEntryPulse(true);
        window.setTimeout(() => setEntryPulse(false), 1200);
        window.setTimeout(() => {
          const el = moduleRefs.current[moduleKey];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          window.setTimeout(() => {
            const target = moduleRefs.current[moduleKey];
            const b = sheetEntryRef.current;
            let endX = window.innerWidth - 48;
            let endY = 64;
            if (target) {
              const t = target.getBoundingClientRect();
              endX = t.left + Math.min(32, t.width * 0.2);
              endY = t.top + 20;
            } else if (b) {
              const t = b.getBoundingClientRect();
              endX = t.left + t.width / 2;
              endY = t.top + t.height / 2;
            }
            run(startX, startY, endX, endY);
          }, MOBILE_SCROLL_THEN_STAR_MS);
        }, MOBILE_SHEET_OPEN_MS);
        return;
      }

      const el = moduleRefs.current[moduleKey];
      if (el) {
        const t = el.getBoundingClientRect();
        run(
          startX,
          startY,
          t.left + Math.min(32, t.width * 0.2),
          t.top + 20,
        );
      }
    },
    [isLg],
  );

  const appendSummaryToRightPanel = (draft: SummaryDraft) => {
    setRightPanelContent((prev) => {
      if (manualEditedModules[draft.moduleKey]) return prev;
      const existing = toPointLines(prev[draft.moduleKey]);
      const merged = [...existing];
      draft.points.forEach((line) => {
        if (line && !merged.includes(line)) merged.push(line);
      });
      return {
        ...prev,
        [draft.moduleKey]: merged.map((line) => `- ${line}`).join("\n"),
      };
    });
  };

  const finishCurrentQuestion = (draft: SummaryDraft, fromRevisionCap = false) => {
    const progress = questionProgress[draft.questionId];
    const combinedAnswer = buildCombinedAnswer(progress?.userAnswers ?? []);
    setAiFilledModules((prev) => ({ ...prev, [draft.moduleKey]: true }));
    appendSummaryToRightPanel(draft);
    triggerStar(draft.moduleKey, draft.questionId);
    if (!fromRevisionCap) {
      pushAudit({
        questionId: draft.questionId,
        moduleKey: draft.moduleKey,
        rawAnswer: combinedAnswer,
        aiSummary: draft.text,
        revisionCount: progress?.revisionCount ?? revisionCount,
        skipped: false,
        confirmed: true,
      });
    } else {
      pushAudit({
        questionId: draft.questionId,
        moduleKey: draft.moduleKey,
        rawAnswer: combinedAnswer,
        aiSummary: draft.text,
        revisionCount: 3,
        skipped: false,
        confirmed: true,
      });
    }
    setSummaryDraft(null);
    setAwaitingConfirm(false);
    setRevisionContextSummary(undefined);
    setDraftInput("");
    setRevisionCount(0);
    setAwaitingRevisionCapAck(false);
    const next = currentQuestionIndex + 1;
    transitionToNextQuestion(next);
  };

  async function submitAnswer(answer: string, isSkip: boolean) {
    if (!currentQuestion) return;
    if (!isSkip && !answer.trim()) return;
    if (isSkip) {
      const u = "这部分我先不说。";
      const typingMsg = createMessage("ai", "", {
        kind: "summary",
        questionId: currentQuestion.id,
      });
      setChatMessages((prev) => [
        ...prev,
        createMessage("user", u),
        typingMsg,
      ]);
      pushAudit({
        questionId: currentQuestion.id,
        moduleKey: currentQuestion.rightPanelKey,
        rawAnswer: u,
        aiSummary: "",
        revisionCount,
        skipped: true,
        confirmed: true,
      });
      setAiFilledModules((prev) => ({
        ...prev,
        [currentQuestion.rightPanelKey]: true,
      }));
      setDraftInput("");
      setRevisionContextSummary(undefined);
      setSummaryDraft(null);
      setAwaitingConfirm(false);
      setRevisionCount(0);
      const next = currentQuestionIndex + 1;
      if (skipTypingTimerRef.current) clearTimeout(skipTypingTimerRef.current);
      skipTypingTimerRef.current = window.setTimeout(() => {
        skipTypingTimerRef.current = null;
        const typingId = typingMsg.id;
        setChatMessages((prev) => prev.filter((m) => m.id !== typingId));
        setCurrentQuestionIndex(next);
        openNextQuestion(next);
      }, skipTypingDurationMs());
      return;
    }

    const userText = answer.trim();
    const existingProgress = questionProgress[currentQuestion.id];
    const answers = [...(existingProgress?.userAnswers ?? []), userText];
    const combinedAnswer = buildCombinedAnswer(answers);
    setDraftInput("");
    setChatMessages((prev) => [...prev, createMessage("user", userText)]);
    setQuestionProgress((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        userAnswers: answers,
        summary: prev[currentQuestion.id]?.summary ?? "",
        revisionCount: prev[currentQuestion.id]?.revisionCount ?? 0,
      },
    }));

    setIsThinking(true);
    const streamAssistantId = `local-ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setChatMessages((prev) => [
      ...prev,
      {
        id: streamAssistantId,
        role: "ai",
        text: "",
        kind: "summary",
        questionId: currentQuestion.id,
      },
    ]);

    const prevForLlm = revisionContextSummary || existingProgress?.summary;
    setRevisionContextSummary(undefined);

    const applySummaryOutcome = (out: {
      chatSummary: string;
      bullets: string[];
      proactivePreference?: "passive" | "moderate" | "active";
    }) => {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === streamAssistantId
            ? { ...m, text: out.chatSummary }
            : m,
        ),
      );
      setSummaryDraft({
        questionId: currentQuestion.id,
        moduleKey: currentQuestion.rightPanelKey,
        text: out.chatSummary,
        points: out.bullets,
      });
      if (
        currentQuestion.rightPanelKey === "proactiveLevel" &&
        out.proactivePreference
      ) {
        setProactivePreference(out.proactivePreference);
      }
      setQuestionProgress((prev) => ({
        ...prev,
        [currentQuestion.id]: {
          userAnswers: answers,
          summary: out.chatSummary,
          revisionCount: prev[currentQuestion.id]?.revisionCount ?? 0,
        },
      }));
      setAwaitingConfirm(true);
    };

    try {
      const res = await fetch("/api/onboarding/summarize/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          userAnswer: combinedAnswer,
          previousChatSummary: prevForLlm,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (
        !res.ok ||
        !contentType.includes("text/event-stream") ||
        !res.body
      ) {
        const fb = clientSummaryFallback(currentQuestion, combinedAnswer);
        applySummaryOutcome(fb);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamOk = false;
      let donePayload: {
        chatSummary: string;
        bullets: string[];
        proactivePreference?: "passive" | "moderate" | "active";
      } | null = null;

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
            if (delta) {
              setChatMessages((prev) =>
                prev.map((m) =>
                  m.id === streamAssistantId
                    ? { ...m, text: m.text + delta }
                    : m,
                ),
              );
            }
          }
          if (event === "done") {
            streamOk = true;
            const d = data as {
              chatSummary?: unknown;
              bullets?: unknown;
              proactivePreference?: unknown;
            };
            const chatSummary =
              typeof d.chatSummary === "string" ? d.chatSummary.trim() : "";
            const bullets = Array.isArray(d.bullets)
              ? d.bullets
                  .map((b) => (typeof b === "string" ? b.trim() : String(b)))
                  .filter(Boolean)
              : [];
            const proactiveRaw = d.proactivePreference;
            const proactivePreference =
              typeof proactiveRaw === "string" &&
              ["passive", "moderate", "active"].includes(proactiveRaw.trim())
                ? (proactiveRaw.trim() as "passive" | "moderate" | "active")
                : undefined;
            if (chatSummary) {
              donePayload = {
                chatSummary,
                bullets: bullets.length ? bullets : [chatSummary],
                ...(proactivePreference ? { proactivePreference } : {}),
              };
            }
          }
          if (event === "error") {
            streamOk = false;
          }
        }
      }

      if (streamOk && donePayload) {
        applySummaryOutcome(donePayload);
      } else {
        const fb = clientSummaryFallback(currentQuestion, combinedAnswer);
        applySummaryOutcome(fb);
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === streamAssistantId ? { ...m, text: fb.chatSummary } : m,
          ),
        );
      }
    } catch {
      const fb = clientSummaryFallback(currentQuestion, combinedAnswer);
      applySummaryOutcome(fb);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === streamAssistantId ? { ...m, text: fb.chatSummary } : m,
        ),
      );
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (awaitingConfirm || isThinking || !currentQuestion || awaitingRevisionCapAck)
      return;
    if (!openingAcknowledged) return;
    void submitAnswer(draftInput, false);
  }

  function handleConfirmSummary() {
    if (!summaryDraft) return;
    finishCurrentQuestion(summaryDraft, false);
  }

  function handleSupplementSummary() {
    if (!currentQuestion || !summaryDraft) return;
    if (awaitingRevisionCapAck) return;
    if (revisionCount >= 3) return;
    setRevisionContextSummary(summaryDraft.text);
    setRevisionCount((c) => {
      const nextCount = c + 1;
      setQuestionProgress((prev) => {
        const current = prev[currentQuestion.id];
        if (!current) return prev;
        return {
          ...prev,
          [currentQuestion.id]: {
            ...current,
            revisionCount: nextCount,
          },
        };
      });
      return nextCount;
    });
    setAwaitingConfirm(false);
    setDraftInput("");
    setSummaryDraft(null);
  }

  function handleRevisionCapAck() {
    if (!summaryDraft) return;
    finishCurrentQuestion(summaryDraft, true);
  }

  function handleSkipQuestion() {
    setShowSkipModal(false);
    void submitAnswer("", true);
  }

  function handleOpeningAck() {
    setTimeout(() => {
      setOpeningAcknowledged(true);
      setShowOpeningButton(false);
      setChatMessages((prev) => [
        ...prev,
        createMessage("ai", firstQuestion.prompt, {
          kind: "question",
          questionId: firstQuestion.id,
        }),
      ]);
    }, OPENING_TRANSITION_MS);
  }

  const handleEnterChat = async () => {
    setSaveStatus("saving");
    try {
      await fullPersist();
      await fetch("/api/chat/ensure-onboarding-greeting", { method: "POST" });
      setSaveStatus("saved");
      router.push("/chat");
    } catch {
      setSaveStatus("error");
    }
  };

  const showInput =
    currentQuestion &&
    !awaitingConfirm &&
    !isOnboardingDone &&
    openingAcknowledged &&
    !isThinking &&
    !isQuestionTransitioning;

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-gradient-to-b from-orange-50/70 via-rose-50/30 to-stone-100/50 px-3 pb-[max(3.25rem,calc(env(safe-area-inset-bottom)+2.5rem))] pt-2 text-stone-900/90 sm:px-4 sm:pt-4 lg:pb-6 lg:pt-6">
      {loadError && loadStatus === "error" && (
        <p className="mb-2 shrink-0 text-center text-sm text-stone-700/70">{loadError}</p>
      )}

      <div
        className={`mx-auto flex w-full max-w-6xl flex-1 min-h-0 flex-col gap-2 sm:gap-4 lg:grid lg:grid-cols-[1.02fr_0.98fr] lg:gap-4 ${
          loadStatus === "loading" ? "opacity-50" : ""
        }`}
      >
        <section className="order-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-stone-200/70 bg-white/82 shadow-sm shadow-stone-200/35 backdrop-blur-sm lg:max-h-[min(82dvh,40rem)] lg:flex-none">
          <div className="shrink-0 border-b border-stone-100/90 px-4 py-4 sm:px-5">
            <h1 className="mt-1 text-base font-semibold sm:text-lg">
                开始前的小小了解
            </h1>
          </div>

          <div
            ref={onboardingScrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-3 [-webkit-overflow-scrolling:touch] sm:px-4 sm:py-4"
          >
            {chatMessages.map((msg) => {
              const aiLongScrollKinds =
                msg.role === "ai" &&
                (msg.kind === "question" || msg.kind === "ending");
              return (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.kind === "summary" || msg.kind === "typing" ? (
                  <div
                    ref={(el) => {
                      if (msg.questionId) {
                        summaryBubbleRefs.current[msg.questionId] = el;
                      }
                    }}
                    className={`whitespace-pre-wrap ${ONBOARDING_ASSISTANT_BUBBLE}`}
                  >
                    {msg.text.trim() === "" ? (
                      <AssistantTypingDots variant="onboarding" className="py-0.5" />
                    ) : (
                      msg.text
                    )}
                  </div>
                ) : (
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[85%] ${
                      msg.role === "user"
                        ? "whitespace-pre-wrap bg-stone-800 text-orange-50"
                        : "border border-stone-200/80 bg-orange-50/35 text-stone-900/90"
                    }`}
                  >
                    {msg.role === "user" ? (
                      msg.text
                    ) : aiLongScrollKinds ? (
                      <div className="max-h-[min(52dvh,26rem)] overflow-y-auto overscroll-y-contain whitespace-pre-wrap pr-0.5 [-webkit-overflow-scrolling:touch]">
                        {msg.text}
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.text}</span>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>

          {showOpeningButton && !isOnboardingDone && loadStatus === "ready" && (
            <div className="border-t border-stone-100/90 px-3 pb-4 pt-3 sm:px-4">
              <button
                type="button"
                onClick={handleOpeningAck}
                className="w-full rounded-2xl bg-stone-800 px-3 py-2.5 text-sm font-medium text-orange-50"
              >
                好呀
              </button>
            </div>
          )}

          {showInput && (
            <div className="space-y-3 border-t border-stone-100/90 px-3 pb-4 pt-3 sm:px-4">
              {currentQuestion?.hintCards &&
                currentQuestion.hintCards.length > 0 &&
                (currentQuestionIndex === LAST_ONBOARDING_QUESTION_INDEX ? (
                  <div
                    className={`space-y-2.5 max-md:overflow-y-auto max-md:overscroll-y-contain max-md:pr-0.5 [-webkit-overflow-scrolling:touch] ${
                      lastQuestionHintExpanded
                        ? "max-md:max-h-[min(50dvh,24rem)]"
                        : "max-md:max-h-[min(38dvh,16rem)]"
                    }`}
                  >
                    {currentQuestion.hintLead ? (
                      <p className="text-xs leading-relaxed text-stone-700/70">
                        {currentQuestion.hintLead}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2.5">
                      {(lastQuestionHintExpanded
                        ? currentQuestion.hintCards
                        : currentQuestion.hintCards.slice(
                            0,
                            LAST_QUESTION_HINT_INITIAL_VISIBLE_CHIPS,
                          )
                      ).map((card) => (
                        <div
                          key={card}
                          className="pointer-events-none max-w-full rounded-2xl border border-orange-100/80 bg-gradient-to-br from-orange-50/90 to-amber-50/65 px-3.5 py-2.5 text-xs leading-relaxed text-stone-800/85 shadow-sm shadow-orange-100/40 sm:text-sm"
                          role="note"
                        >
                          {card}
                        </div>
                      ))}
                    </div>
                    {currentQuestion.hintCards.length >
                    LAST_QUESTION_HINT_INITIAL_VISIBLE_CHIPS ? (
                      <button
                        type="button"
                        onClick={() =>
                          setLastQuestionHintExpanded((prev) => !prev)
                        }
                        className="text-left text-xs font-normal text-stone-600/95 underline decoration-stone-400/55 underline-offset-[3px] hover:text-stone-800/95"
                      >
                        {lastQuestionHintExpanded
                          ? "收起例子"
                          : "展开更多例子"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs leading-relaxed text-stone-700/70">
                      {currentQuestion.hintLead}
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {currentQuestion.hintCards.map((card) => (
                        <div
                          key={card}
                          className="pointer-events-none max-w-full rounded-2xl border border-orange-100/80 bg-gradient-to-br from-orange-50/90 to-amber-50/65 px-3.5 py-2.5 text-xs leading-relaxed text-stone-800/85 shadow-sm shadow-orange-100/40 sm:text-sm"
                          role="note"
                        >
                          {card}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

              <form onSubmit={handleSubmit} className="space-y-2">
                <textarea
                  value={draftInput}
                  onChange={(e) => setDraftInput(e.target.value)}
                  rows={4}
                  placeholder="你可以慢慢说，我会认真听。"
                  className="w-full resize-none rounded-2xl border border-stone-200/75 bg-white/94 px-3 py-3 text-base leading-relaxed text-stone-900/90 outline-none ring-orange-200/40 placeholder:text-stone-500/55 focus:ring-2 sm:py-2.5 lg:text-sm"
                  enterKeyHint="send"
                  autoComplete="on"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={!draftInput.trim() || isThinking}
                    className="flex-1 rounded-2xl bg-stone-800 px-3 py-2.5 text-sm font-medium text-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    发送回答
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSkipModal(true)}
                    className="rounded-2xl border border-stone-300/55 bg-white/92 px-3 py-2.5 text-sm text-stone-800/85"
                  >
                    先不说
                  </button>
                </div>
              </form>
            </div>
          )}

          {awaitingConfirm && summaryDraft && (
            <div className="space-y-2 border-t border-stone-100/90 px-3 pb-4 pt-3 sm:px-4">
              <p className="text-xs text-stone-700/65">这段整理你看是否准确</p>
              {awaitingRevisionCapAck || revisionCount >= 3 ? (
                <p className="text-xs leading-relaxed text-stone-700/75">
                  我先按现在这样记下来。之后你可以直接去右边改，我会以右边最终写的内容为准。
                </p>
              ) : null}
              {awaitingRevisionCapAck || revisionCount >= 3 ? (
                <button
                  type="button"
                  onClick={handleRevisionCapAck}
                  className="w-full rounded-2xl border border-stone-300/55 bg-white/92 px-3 py-2.5 text-sm font-medium text-stone-800/90"
                >
                  好的
                </button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleConfirmSummary}
                    className="flex-1 rounded-2xl bg-stone-800 px-3 py-2.5 text-sm font-medium text-orange-50"
                  >
                    对的，继续
                  </button>
                  <button
                    type="button"
                    onClick={handleSupplementSummary}
                    className="rounded-2xl border border-stone-300/55 bg-white/92 px-3 py-2.5 text-sm text-stone-800/85 sm:flex-1"
                  >
                    我想补充一下
                  </button>
                </div>
              )}
              {revisionCount > 0 && (
                <p className="text-xs text-stone-700/65">
                  当前已调整 {revisionCount} 轮
                </p>
              )}
            </div>
          )}

          {isQuestionTransitioning && openingAcknowledged && !isOnboardingDone && (
            <div className="space-y-2 border-t border-stone-100/90 px-3 pb-4 pt-3 sm:px-4">
              <AiThinkingDots />
            </div>
          )}

          <div ref={onboardingTailRef} className="h-0 shrink-0" aria-hidden />
        </section>

        <div className="order-2 min-h-0 lg:order-2">
          {isLg && (
            <SupportContextPanel
              groupedUser={grouped.user}
              groupedAi={grouped.ai}
              rightPanelContent={rightPanelContent}
              setRightPanelContent={setRightPanelContent}
              setManualEditedModules={setManualEditedModules}
              aiFilledModules={aiFilledModules}
              highlightModule={highlightModule}
              moduleRefs={moduleRefs}
              isOnboardingDone={isOnboardingDone}
              saveStatus={saveStatus}
              onEnterChat={handleEnterChat}
              canEnterChat={isOnboardingDone}
              className="rounded-3xl border border-stone-200/70 bg-white/82 p-4 shadow-sm shadow-stone-200/30 backdrop-blur-sm sm:p-5"
            />
          )}
        </div>
      </div>

      {!isLg && (
        <>
          <button
            type="button"
            ref={sheetEntryRef}
            onClick={() => setSheetOpen((o) => !o)}
            className={`fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 min-h-[48px] w-[min(100%-1.25rem,22rem)] -translate-x-1/2 rounded-full border border-stone-200/70 bg-orange-50/92 px-4 py-2.5 text-sm font-medium text-stone-800/90 shadow-lg shadow-stone-200/35 backdrop-blur-sm transition ${
              entryPulse ? "ring-2 ring-orange-200" : "ring-0"
            }`}
          >
            我们整理出的支持设定{sheetOpen ? " · 收起" : " · 展开"}
          </button>
          <div
            className={`fixed inset-x-0 bottom-0 z-20 max-h-[min(88dvh,92svh)] overflow-y-auto rounded-t-3xl border border-stone-200/70 bg-orange-50/94 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-stone-200/30 transition-transform duration-300 ease-out ${
              sheetOpen ? "translate-y-0" : "translate-y-full"
            } lg:hidden`}
          >
            <SupportContextPanel
              groupedUser={grouped.user}
              groupedAi={grouped.ai}
              rightPanelContent={rightPanelContent}
              setRightPanelContent={setRightPanelContent}
              setManualEditedModules={setManualEditedModules}
              aiFilledModules={aiFilledModules}
              highlightModule={highlightModule}
              moduleRefs={moduleRefs}
              isOnboardingDone={isOnboardingDone}
              saveStatus={saveStatus}
              onEnterChat={handleEnterChat}
              canEnterChat={isOnboardingDone}
              className="pb-20"
            />
          </div>
          {sheetOpen && (
            <button
              type="button"
              className="fixed inset-0 z-10 bg-black/20 lg:hidden"
              aria-label="关闭"
              onClick={() => setSheetOpen(false)}
            />
          )}
        </>
      )}

      {showSkipModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200/70 bg-orange-50/96 p-4 shadow-2xl">
            <p className="text-sm leading-relaxed text-stone-900/80">
              {SKIP_CONFIRM_BODY}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-col-reverse">
              <button
                type="button"
                onClick={handleSkipQuestion}
                className="w-full rounded-2xl border border-stone-300/55 bg-white/92 py-2.5 text-sm text-stone-800/85"
              >
                还是先不说
              </button>
              <button
                type="button"
                onClick={() => setShowSkipModal(false)}
                className="w-full rounded-2xl bg-stone-800 py-2.5 text-sm font-medium text-orange-50"
              >
                继续回答
              </button>
            </div>
          </div>
        </div>
      )}

      {flyingStar && (
        <div
          className="pointer-events-none fixed z-50 transition-[left,top,transform,opacity,filter] ease-out will-change-transform"
          style={{
            left: flyingStar.active ? flyingStar.endX : flyingStar.startX,
            top: flyingStar.active ? flyingStar.endY : flyingStar.startY,
            transform: `translate(-50%, -50%) scale(${flyingStar.active ? 0.92 : 1.02})`,
            opacity: flyingStar.active ? 0.78 : 0.48,
            filter: `drop-shadow(0 0 ${flyingStar.active ? 6 : 11}px rgba(251, 191, 36, 0.32))`,
            transitionDuration: flyingStar.active ? `${STAR_FLY_MS}ms` : "280ms",
            transitionTimingFunction: flyingStar.active
              ? "cubic-bezier(0.18, 0.72, 0.22, 1)"
              : "ease-out",
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-8 w-8"
            fill="none"
          >
            <path
              d="M12 2.8c.3 0 .56.21.62.5l.88 4.24c.12.56.56 1 1.12 1.12l4.24.88a.63.63 0 0 1 0 1.24l-4.24.88c-.56.12-1 .56-1.12 1.12l-.88 4.24a.63.63 0 0 1-1.24 0l-.88-4.24a1.58 1.58 0 0 0-1.12-1.12l-4.24-.88a.63.63 0 0 1 0-1.24l4.24-.88c.56-.12 1-.56 1.12-1.12l.88-4.24c.06-.29.32-.5.62-.5Z"
              fill="rgba(253, 186, 116, 0.9)"
            />
            <path
              d="M12 5.8v12.4M5.8 12h12.4"
              stroke="rgba(255, 247, 237, 0.92)"
              strokeWidth="1.05"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="1.45" fill="rgba(255, 251, 235, 0.95)" />
          </svg>
        </div>
      )}

      {flyNotice && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-full border border-stone-300/45 bg-stone-800 px-4 py-2 text-center text-xs text-orange-50 shadow-lg">
          {flyNotice}
        </div>
      )}
    </main>
  );
}
