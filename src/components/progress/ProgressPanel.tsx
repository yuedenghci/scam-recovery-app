"use client";

type ProgressLetter = {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function ProgressPanel({
  open,
  letters,
  onClose,
  onOpenLetter,
}: {
  open: boolean;
  letters: ProgressLetter[];
  onClose: () => void;
  onOpenLetter: (letterId: string) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[53] flex items-end justify-center bg-stone-900/20 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="最近收到的来信"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[min(85dvh,34rem)] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium text-stone-800">最近收到的来信</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-stone-700 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
          >
            关闭
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-stone-500">最近的回信</p>
          {letters.length === 0 ? (
            <p className="rounded-xl border border-stone-200/70 bg-white/80 px-3 py-3 text-sm text-stone-500">
              还没有新的回信。
            </p>
          ) : (
            <ul className="space-y-2">
              {letters.map((letter) => (
                <li key={letter.id}>
                  <button
                    type="button"
                    onClick={() => onOpenLetter(letter.id)}
                    className="min-h-[48px] w-full rounded-xl border border-stone-200/80 bg-white/90 px-3 py-3 text-left hover:border-stone-300 hover:bg-stone-50 sm:min-h-0 sm:py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-stone-800">{letter.title}</p>
                      {!letter.isRead ? (
                        <span className="h-2 w-2 rounded-full bg-rose-400" aria-hidden />
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-stone-500">
                      {formatDate(letter.periodStart)} - {formatDate(letter.periodEnd)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProgressLetterReader({
  letter,
  onClose,
}: {
  letter: ProgressLetter | null;
  onClose: () => void;
}) {
  if (!letter) return null;
  return (
    <div
      className="fixed inset-0 z-[54] flex items-end justify-center bg-stone-900/20 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="回信内容"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-stone-200/80 bg-[#fbf9f5] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[min(85dvh,34rem)] sm:rounded-2xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-medium text-stone-800">{letter.title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 text-sm text-stone-500 hover:bg-stone-200/50 hover:text-stone-700 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1"
          >
            关闭
          </button>
        </div>
        <p className="mb-3 text-xs text-stone-500">
          {formatDate(letter.periodStart)} - {formatDate(letter.periodEnd)}
        </p>
        <p
          className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-700"
          style={{
            // 用更接近手写的字体栈；如果用户环境没有对应字体，会自动 fallback 到 cursive。
            fontFamily: '"Patrick Hand", "Comic Sans MS", cursive',
          }}
        >
          {letter.body}
        </p>
      </div>
    </div>
  );
}
