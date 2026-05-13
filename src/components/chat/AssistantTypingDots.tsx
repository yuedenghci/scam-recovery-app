"use client";

/**
 * Compact three-dot bounce for assistant “typing” placeholders (chat bubbles, onboarding).
 * Matches the small-dot timing used in the chat composer send button.
 */
export function AssistantTypingDots({
  variant = "chatBubble",
  className = "",
}: {
  variant?: "chatBubble" | "onboarding";
  className?: string;
}) {
  const dot =
    "inline-block h-1.5 w-1.5 animate-bounce rounded-full [animation-duration:0.9s]";
  const c1 =
    variant === "onboarding" ? "bg-orange-300/75" : "bg-stone-400/85";
  const c2 =
    variant === "onboarding" ? "bg-orange-300/55" : "bg-stone-500/75";
  const c3 =
    variant === "onboarding" ? "bg-orange-300/40" : "bg-stone-600/65";

  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      aria-hidden
    >
      <span className={`${dot} ${c1} [animation-delay:0ms]`} />
      <span className={`${dot} ${c2} [animation-delay:150ms]`} />
      <span className={`${dot} ${c3} [animation-delay:300ms]`} />
    </span>
  );
}
