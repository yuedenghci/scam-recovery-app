"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { type RightPanelKey, RIGHT_PANEL_MODULES } from "@/lib/onboardingFlow";

type ModuleItem = (typeof RIGHT_PANEL_MODULES)[number];

const LOCKED_PLACEHOLDER = "还没有聊到这一部分";
const UNLOCKED_EMPTY_PLACEHOLDER = "你可以稍后补充";

type Props = {
  groupedUser: ModuleItem[];
  groupedAi: ModuleItem[];
  rightPanelContent: Record<RightPanelKey, string>;
  setRightPanelContent: Dispatch<SetStateAction<Record<RightPanelKey, string>>>;
  setManualEditedModules: Dispatch<
    SetStateAction<Partial<Record<RightPanelKey, boolean>>>
  >;
  /** Modules the user may edit after this onboarding part was passed (answered or skipped). */
  aiFilledModules: Partial<Record<RightPanelKey, boolean>>;
  highlightModule: RightPanelKey | null;
  moduleRefs: MutableRefObject<Record<RightPanelKey, HTMLDivElement | null>>;
  isOnboardingDone: boolean;
  canEnterChat?: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onEnterChat: () => void;
  className?: string;
};

export function SupportContextPanel({
  groupedUser,
  groupedAi,
  rightPanelContent,
  setRightPanelContent,
  setManualEditedModules,
  aiFilledModules,
  highlightModule,
  moduleRefs,
  isOnboardingDone,
  canEnterChat = false,
  saveStatus,
  onEnterChat,
  className = "",
}: Props) {
  return (
    <div className={className}>
      <h2 className="text-base font-semibold text-stone-900/90">
        整理出的支持设定
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-stone-700/60">
      交流过的部分你也可直接手动编辑，并且你改过的内容优先。
      </p>

      <div className="mt-4 space-y-4">
        <div className="space-y-3">
          <p className="text-xs font-medium text-stone-700/65">关于用户</p>
          {groupedUser.map((module) => (
            <div
              key={module.key}
              ref={(el) => {
                if (moduleRefs.current) moduleRefs.current[module.key] = el;
              }}
              className={`rounded-2xl border p-3 shadow-sm transition-[box-shadow,background-color,border-color] duration-500 scroll-mt-8 scroll-mb-[max(5.5rem,calc(3.5rem+env(safe-area-inset-bottom)))] ${
                highlightModule === module.key
                  ? "border-amber-300/80 bg-amber-50/70 shadow-md shadow-amber-100/50 ring-2 ring-amber-200/55"
                  : "border-stone-200/70 bg-white/82"
              }`}
            >
              <p className="mb-2 text-sm font-medium text-stone-900/85">
                {module.title}
              </p>
              <textarea
                value={rightPanelContent[module.key]}
                disabled={!aiFilledModules[module.key]}
                onChange={(e) => {
                  setManualEditedModules((prev) => ({
                    ...prev,
                    [module.key]: true,
                  }));
                  setRightPanelContent((prev) => ({
                    ...prev,
                    [module.key]: e.target.value,
                  }));
                }}
                rows={3}
                placeholder={
                  aiFilledModules[module.key]
                    ? UNLOCKED_EMPTY_PLACEHOLDER
                    : LOCKED_PLACEHOLDER
                }
                className={`w-full resize-y rounded-xl border px-2.5 py-2 text-base leading-relaxed outline-none lg:text-sm ${
                  aiFilledModules[module.key]
                    ? "border-stone-200/75 bg-white/92 text-stone-900/90 ring-orange-200/45 placeholder:text-stone-500/55 focus:ring-2"
                    : "cursor-not-allowed border-stone-200/50 bg-stone-100/80 text-stone-500/70 placeholder:text-stone-400/80"
                }`}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-stone-700/65">关于 AI</p>
          {groupedAi.map((module) => (
            <div
              key={module.key}
              ref={(el) => {
                if (moduleRefs.current) moduleRefs.current[module.key] = el;
              }}
              className={`rounded-2xl border p-3 shadow-sm transition-[box-shadow,background-color,border-color] duration-500 scroll-mt-8 scroll-mb-[max(5.5rem,calc(3.5rem+env(safe-area-inset-bottom)))] ${
                highlightModule === module.key
                  ? "border-amber-300/80 bg-amber-50/70 shadow-md shadow-amber-100/50 ring-2 ring-amber-200/55"
                  : "border-stone-200/70 bg-white/82"
              }`}
            >
              <p className="mb-2 text-sm font-medium text-stone-900/85">
                {module.title}
              </p>
              <textarea
                value={rightPanelContent[module.key]}
                disabled={!aiFilledModules[module.key]}
                onChange={(e) => {
                  setManualEditedModules((prev) => ({
                    ...prev,
                    [module.key]: true,
                  }));
                  setRightPanelContent((prev) => ({
                    ...prev,
                    [module.key]: e.target.value,
                  }));
                }}
                rows={3}
                placeholder={
                  aiFilledModules[module.key]
                    ? UNLOCKED_EMPTY_PLACEHOLDER
                    : LOCKED_PLACEHOLDER
                }
                className={`w-full resize-y rounded-xl border px-2.5 py-2 text-base leading-relaxed outline-none lg:text-sm ${
                  aiFilledModules[module.key]
                    ? "border-stone-200/75 bg-white/92 text-stone-900/90 ring-orange-200/45 placeholder:text-stone-500/55 focus:ring-2"
                    : "cursor-not-allowed border-stone-200/50 bg-stone-100/80 text-stone-500/70 placeholder:text-stone-400/80"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {isOnboardingDone && (
        <div className="mt-5 space-y-2 rounded-2xl border border-orange-100/80 bg-orange-50/55 p-3">
          <p className="text-sm text-stone-900/80">
            如果你准备好了，我们就可以开始正式进入了。正式陪伴时会以这里的信息为准，你也可以随时再回来修改。
          </p>
          <button
            type="button"
            onClick={onEnterChat}
            disabled={saveStatus === "saving" || !canEnterChat}
            className="w-full rounded-xl bg-stone-800 px-3 py-2.5 text-sm font-medium text-orange-50 disabled:opacity-50"
          >
            {saveStatus === "saving" ? "处理中…" : "去聊天"}
          </button>
          {saveStatus === "saved" && (
            <p className="text-xs text-emerald-800/90">已同步，准备进入聊天。</p>
          )}
          {saveStatus === "error" && (
            <p className="text-xs text-red-600">保存失败，请重试或检查网络。</p>
          )}
        </div>
      )}
    </div>
  );
}
