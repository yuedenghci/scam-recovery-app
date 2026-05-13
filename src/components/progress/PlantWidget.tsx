"use client";

import { useEffect, useState } from "react";

const STAGE_IMAGE_MAP = [
  "/assets/progress/plant-stage-0.png",
  "/assets/progress/plant-stage-1.png",
  "/assets/progress/plant-stage-2.png",
  "/assets/progress/plant-stage-3.png",
  "/assets/progress/plant-stage-4.png",
] as const;

const LEGACY_STAGE_IMAGE_MAP = [
  "/assests/progress/plant-stage-0.png",
  "/assests/progress/plant-stage-1.png",
  "/assests/progress/plant-stage-2.png",
  "/assests/progress/plant-stage-3.png",
  "/assests/progress/plant-stage-4.png",
] as const;

const BUTTERFLY_IMAGE = "/assets/progress/butterfly-note.png";
const LEGACY_BUTTERFLY_IMAGE = "/assests/progress/butterfly-note.png";

export function ProgressPlantAndLetters({
  stage,
  hasUnread,
  onOpenLetters,
  density = "floating",
}: {
  stage: number;
  hasUnread: boolean;
  onOpenLetters: () => void;
  /** inline：输入法旁紧凑展示；composer：移动端底栏并排，树苗更大可见；floating：沿用原有尺寸（桌面角标等）。 */
  density?: "floating" | "inline" | "composer";
}) {
  const stageIndex = Math.min(4, Math.max(0, Math.round(stage)));
  const primaryPlantSrc = STAGE_IMAGE_MAP[stageIndex];
  const fallbackPlantSrc = LEGACY_STAGE_IMAGE_MAP[stageIndex];
  const [plantSrc, setPlantSrc] = useState<string>(primaryPlantSrc);
  const [butterflySrc, setButterflySrc] = useState<string>(BUTTERFLY_IMAGE);

  // Reset image source when stage changes.
  useEffect(() => {
    setPlantSrc(primaryPlantSrc);
  }, [primaryPlantSrc]);

  const floatingShell = "relative h-[11.75rem] w-[8.5rem] sm:h-[13rem] sm:w-[9.25rem]";
  const inlineShell =
    "relative flex h-[3.25rem] min-h-[44px] w-[2.9375rem] min-w-[44px] shrink-0 items-end justify-center overflow-visible pb-px";
  /** 底栏并排：左侧预留加宽以容纳约 2× 可视树苗，仍与输入栏底对齐 */
  const composerShell =
    "relative flex h-[80px] w-[min(7.5rem,30vw)] min-w-[6.75rem] max-w-[8.5rem] shrink-0 items-end justify-center overflow-visible";

  const useComposerMotion = density === "composer";
  const plantFloatCls = useComposerMotion
    ? "animate-[plantFloatComposer_5.6s_ease-in-out_infinite]"
    : "animate-[plantFloat_5.6s_ease-in-out_infinite]";
  const plantSwayCls = useComposerMotion
    ? "animate-[plantSwayComposer_7.4s_ease-in-out_infinite]"
    : "animate-[plantSway_7.4s_ease-in-out_infinite]";

  const unreadFloatingShell =
    "pointer-events-none absolute right-0 top-[18%] z-20 flex max-w-[calc(100vw-2.5rem)] flex-row items-center gap-1.5 sm:right-1 sm:top-[16%] sm:max-w-[min(14rem,calc(100vw-3rem))] sm:gap-2";
  /** 移动端底栏：锚在树苗容器右上侧上方，与树苗同一视觉组；外壳不抢点击，仅按钮可点 */
  /**const unreadComposerShell =
    "pointer-events-none absolute bottom-full right-0 z-30 mb-1 flex min-w-0 max-w-[min(15rem,calc(100vw-6.5rem))] flex-row items-center gap-1.5 pr-0.5 lg:hidden";*/
  const unreadComposerShell =
    "pointer-events-none absolute bottom-full left-[3.65rem] z-30 mb-1 flex min-w-0 max-w-[min(13rem,calc(100vw-8rem))] flex-row items-center gap-1 lg:hidden";
  const unreadPeek = (shellClassName: string, labelMaxClass: string) =>
    hasUnread ? (
      <div className={shellClassName}>
        <button
          type="button"
          onClick={onOpenLetters}
          aria-label="打开来信列表"
          className="pointer-events-auto group flex h-[3.1rem] w-[3.1rem] shrink-0 items-center justify-center bg-transparent p-0 shadow-none transition-transform active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/60"
        >
          <span className="relative block h-[2.4rem] w-[2.4rem] animate-[butterflyHover_4.2s_ease-in-out_infinite]">
            <span className="block h-full w-full origin-center animate-[butterflyLiving_5.5s_ease-in-out_infinite]">
              <img
                src={butterflySrc}
                alt=""
                draggable={false}
                onError={() => {
                  if (butterflySrc !== LEGACY_BUTTERFLY_IMAGE) {
                    setButterflySrc(LEGACY_BUTTERFLY_IMAGE);
                  }
                }}
                className="h-full w-full object-contain"
              />
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenLetters}
          aria-label="你有一封来信,请查收～"
          className={`pointer-events-auto min-w-0 shrink bg-transparent px-0 py-0 text-left font-sans text-[11px] font-medium leading-tight text-stone-600 shadow-none sm:text-xs ${labelMaxClass}`}
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          <span className="block whitespace-nowrap">你有一封来信，请查收～</span>
        </button>
      </div>
    ) : null;

  const core = (
    <>
      <button
        type="button"
        onClick={onOpenLetters}
        aria-label={hasUnread ? "查看回信列表（有新的回信）" : "查看回信列表"}
        className="group absolute inset-0 flex cursor-pointer items-end justify-center rounded-3xl transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/60"
      >
        <span className="pointer-events-none relative block select-none" aria-hidden>
          <span
            className={`block h-[11.25rem] w-[7.25rem] drop-shadow-[0_10px_24px_rgba(68,94,74,0.16)] ${plantFloatCls} sm:h-[12.5rem] sm:w-[8rem]`}
          >
            <span className={`block h-full w-full origin-bottom ${plantSwayCls}`}>
              <img
                src={plantSrc}
                alt=""
                draggable={false}
                onError={() => {
                  if (plantSrc !== fallbackPlantSrc) setPlantSrc(fallbackPlantSrc);
                }}
                className={
                  useComposerMotion
                    ? "h-full w-full object-contain [clip-path:inset(5px_0_0_0)]"
                    : "h-full w-full object-contain"
                }
              />
            </span>
          </span>
        </span>
      </button>

      {!useComposerMotion ? unreadPeek(unreadFloatingShell, "max-w-[min(11rem,calc(100vw-5.5rem))] sm:max-w-[min(12rem,calc(100vw-6rem))]") : null}

      <style jsx>{`
        @keyframes plantFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        @keyframes plantFloatComposer {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }
        @keyframes plantSway {
          0%,
          100% {
            transform: rotate(-1.8deg);
          }
          50% {
            transform: rotate(1.8deg);
          }
        }
        @keyframes plantSwayComposer {
          0%,
          100% {
            transform: rotate(-3.2deg);
          }
          50% {
            transform: rotate(3.2deg);
          }
        }
        @keyframes butterflyHover {
          0%,
          100% {
            transform: translateY(0px) translateX(0px);
          }
          50% {
            transform: translateY(-2px) translateX(1px);
          }
        }
        @keyframes butterflyLiving {
          0%,
          100% {
            transform: rotate(-1.2deg) scale(1);
          }
          50% {
            transform: rotate(1.2deg) scale(1.02);
          }
        }
      `}</style>
    </>
  );

  if (density === "inline") {
    return (
      <div className={inlineShell}>
        <div className="pointer-events-auto relative h-[11.75rem] w-[8.5rem] origin-bottom scale-[0.34] translate-y-[2px]">
          {core}
        </div>
      </div>
    );
  }

  if (density === "composer") {
    return (
      <div className={composerShell}>
        {unreadPeek(unreadComposerShell, "max-w-[min(11rem,calc(100vw-7rem))]")}
        {/* scale≈0.78（约为原 0.39 的两倍），底对齐、向上舒展；clip-path 裁掉素材顶端多余细线 */}
        <div className="pointer-events-auto relative h-[11.75rem] w-[8.5rem] origin-bottom scale-[0.78] translate-y-[6px] sm:translate-y-[5px]">
          {core}
        </div>
      </div>
    );
  }

  return <div className={floatingShell}>{core}</div>;
}
