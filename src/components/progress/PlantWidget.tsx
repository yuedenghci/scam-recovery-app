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
  onOpenLatestUnread,
}: {
  stage: number;
  hasUnread: boolean;
  onOpenLetters: () => void;
  onOpenLatestUnread: () => void;
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

  return (
    <div className="relative h-[11.75rem] w-[8.5rem] sm:h-[13rem] sm:w-[9.25rem]">
      <button
        type="button"
        onClick={onOpenLetters}
        aria-label={hasUnread ? "查看回信列表（有新的回信）" : "查看回信列表"}
        className="group absolute inset-0 flex cursor-pointer items-end justify-center rounded-3xl transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/60"
      >
        <span className="pointer-events-none relative block select-none" aria-hidden>
          <span className="block h-[11.25rem] w-[7.25rem] drop-shadow-[0_10px_24px_rgba(68,94,74,0.16)] animate-[plantFloat_5.6s_ease-in-out_infinite] sm:h-[12.5rem] sm:w-[8rem]">
            <span className="block h-full w-full origin-bottom animate-[plantSway_7.4s_ease-in-out_infinite]">
              <img
                src={plantSrc}
                alt=""
                draggable={false}
                onError={() => {
                  if (plantSrc !== fallbackPlantSrc) setPlantSrc(fallbackPlantSrc);
                }}
                className="h-full w-full object-contain"
              />
            </span>
          </span>
        </span>
      </button>

      {hasUnread ? (
        <button
          type="button"
          onClick={onOpenLatestUnread}
          aria-label="打开最新未读回信"
          className="group absolute left-[70%] top-[22%] z-20 flex h-[3.1rem] w-[3.1rem] -translate-x-1/2 items-center justify-center rounded-2xl transition-transform active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-400/60 sm:left-[72%] sm:top-[20%]"
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
                className="h-full w-full object-contain drop-shadow-[0_6px_16px_rgba(73,88,64,0.2)]"
              />
            </span>
          </span>
        </button>
      ) : null}

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
        @keyframes plantSway {
          0%,
          100% {
            transform: rotate(-1.8deg);
          }
          50% {
            transform: rotate(1.8deg);
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
    </div>
  );
}
