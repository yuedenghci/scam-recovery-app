"use client";

import { useEffect, useState } from "react";

type DiaryPayload = {
  ok?: boolean;
  todayEntry?: {
    id: string;
    content: string;
    entryDay: string;
    createdAt: string;
    updatedAt: string;
  } | null;
};

const ALREADY_RECORDED_LABEL = "今天已经记录过啦，明天再来吧";

export function DiaryModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alreadyRecordedToday, setAlreadyRecordedToday] = useState(false);

  useEffect(() => {
    void fetch("/api/diary")
      .then((res) => res.json() as Promise<DiaryPayload>)
      .then((data) => {
        if (!data.ok) throw new Error("加载失败");
        setText(data.todayEntry?.content ?? "");
        setAlreadyRecordedToday(Boolean(data.todayEntry));
      })
      .catch(() => setError("加载日记失败，请稍后再试"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  return (
    <div
      className="fixed inset-0 z-[53] flex items-end justify-center bg-stone-900/20 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="今日日记"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[min(85dvh,34rem)] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium text-stone-800">今天的日记</h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-stone-700 disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
          >
            关闭
          </button>
        </div>

        <p className="mb-3 text-sm leading-relaxed text-stone-600">
          你可以写一点今天的片段、想法，或者只是几句话。写多写少都可以。
        </p>

        {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
        {loading ? (
          <p className="text-sm text-stone-500">加载中…</p>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={alreadyRecordedToday}
              rows={10}
              placeholder="今天想记下什么？"
              className="w-full resize-none rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-base text-stone-800 placeholder:text-stone-400 outline-none read-only:bg-stone-50 read-only:text-stone-700 focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)] sm:text-[15px]"
            />
            <button
              type="button"
              disabled={saving || alreadyRecordedToday}
              onClick={() => {
                const content = text.trim();
                if (!content) {
                  setError("写一点点再保存吧");
                  return;
                }
                setSaving(true);
                setError(null);
                void fetch("/api/diary", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                })
                  .then(async (res) => {
                    const data = (await res.json()) as { ok?: boolean; error?: string };
                    if (!res.ok || !data.ok) {
                      throw new Error(data.error || "保存失败");
                    }
                    onSaved();
                    onClose();
                  })
                  .catch((e: unknown) =>
                    setError(e instanceof Error ? e.message : "保存失败，请稍后再试")
                  )
                  .finally(() => setSaving(false));
              }}
              className={`mt-3 w-full rounded-2xl py-3 text-sm font-medium transition-colors ${
                alreadyRecordedToday
                  ? "cursor-not-allowed bg-stone-200 text-stone-400"
                  : "bg-stone-600 text-stone-50 hover:bg-stone-700 active:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              }`}
            >
              {alreadyRecordedToday
                ? ALREADY_RECORDED_LABEL
                : saving
                  ? "保存中…"
                  : "保存今天的日记"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
