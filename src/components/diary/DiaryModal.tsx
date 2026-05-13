"use client";

import { useCallback, useEffect, useState } from "react";

type DiaryEntryRow = {
  id: string;
  content: string;
  entryDay: string;
  createdAt: string;
  updatedAt: string;
};

type DiaryListPayload = {
  ok?: boolean;
  entries?: DiaryEntryRow[];
};

type DiaryView = "write" | "history";

const PREVIEW_LEN = 160;

function formatDiaryDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function DiaryModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [view, setView] = useState<DiaryView>("write");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<DiaryEntryRow[]>([]);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const loadEntries = useCallback(async () => {
    const res = await fetch("/api/diary");
    const data = (await res.json()) as DiaryListPayload;
    if (!res.ok || data.ok === false) throw new Error("加载失败");
    setEntries(Array.isArray(data.entries) ? data.entries : []);
  }, []);

  useEffect(() => {
    void loadEntries()
      .catch(() => setError("加载日记失败，请稍后再试"))
      .finally(() => setLoading(false));
  }, [loadEntries]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const historySection = (
    <>
      {loading ? (
        <p className="text-sm text-stone-500">加载中…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-stone-600">还没有写过日记。</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((row) => {
            const expanded = expandedIds[row.id] === true;
            const long = row.content.length > PREVIEW_LEN;
            const shown =
              expanded || !long
                ? row.content
                : `${row.content.slice(0, PREVIEW_LEN).trim()}…`;
            return (
              <li
                key={row.id}
                className="rounded-lg border border-stone-200/60 bg-[#fbf9f5] px-3 py-2.5"
              >
                <p className="text-[11px] text-stone-500">
                  {formatDiaryDateTime(row.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
                  {shown}
                </p>
                {long ? (
                  <button
                    type="button"
                    className="mt-1.5 text-xs font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-stone-800"
                    onClick={() =>
                      setExpandedIds((prev) => ({
                        ...prev,
                        [row.id]: !expanded,
                      }))
                    }
                  >
                    {expanded ? "收起" : "展开全文"}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

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
        aria-label={view === "write" ? "日记" : "以往日记"}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[min(85dvh,40rem)] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "write" ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium text-stone-800">日记</h2>
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

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="今天想记下什么？"
              className="w-full resize-none rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-base text-stone-800 placeholder:text-stone-400 outline-none focus:border-stone-300 focus:shadow-[0_0_0_3px_rgba(120,113,108,0.1)] sm:text-[15px]"
            />
            <button
              type="button"
              disabled={saving}
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
                    const data = (await res.json()) as {
                      ok?: boolean;
                      error?: string;
                      diary?: DiaryEntryRow;
                    };
                    if (!res.ok || !data.ok) {
                      throw new Error(data.error || "保存失败");
                    }
                    if (data.diary) {
                      setEntries((prev) => {
                        const rest = prev.filter((e) => e.id !== data.diary!.id);
                        return [data.diary!, ...rest];
                      });
                    } else {
                      await loadEntries();
                    }
                    setText("");
                    onSaved();
                  })
                  .catch((e: unknown) =>
                    setError(e instanceof Error ? e.message : "保存失败，请稍后再试")
                  )
                  .finally(() => setSaving(false));
              }}
              className="mt-3 w-full rounded-2xl bg-stone-600 py-3 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700 active:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存日记"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => setView("history")}
              className="mt-2 w-full rounded-xl border border-stone-200/90 bg-white/50 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100/70 hover:text-stone-800 disabled:opacity-50"
            >
              查看以往日记
            </button>
          </>
        ) : (
          <>
            <div className="relative mb-3 flex min-h-[44px] items-center justify-center">
              <button
                type="button"
                disabled={saving}
                onClick={() => setView("write")}
                className="absolute left-0 top-1/2 max-w-[42%] -translate-y-1/2 rounded-lg px-1 py-2 text-left text-sm font-medium text-stone-600 underline decoration-stone-300 underline-offset-2 hover:bg-stone-200/40 hover:text-stone-800 disabled:opacity-50 sm:max-w-none sm:py-1"
              >
                返回写日记
              </button>
              <h2 className="pointer-events-none px-12 text-center text-base font-medium text-stone-800">
                以往日记
              </h2>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="absolute right-0 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 rounded-lg px-3 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-stone-700 disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
              >
                关闭
              </button>
            </div>

            {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}

            <section className="rounded-xl border border-stone-200/70 bg-white/60 p-3">
              {historySection}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
