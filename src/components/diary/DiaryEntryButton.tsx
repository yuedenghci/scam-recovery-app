"use client";

export function DiaryEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] w-full rounded-xl border border-stone-300/80 bg-white/90 px-3 py-2.5 text-xs font-medium tracking-wide text-stone-600 shadow-sm transition-[color,background-color,border-color,box-shadow] hover:border-stone-400 hover:bg-white hover:text-stone-800 hover:shadow-sm active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/70 sm:min-h-0 sm:w-auto sm:py-2"
    >
      写日记
    </button>
  );
}
