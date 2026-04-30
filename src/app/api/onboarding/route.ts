import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { type Prisma, Prisma as PrismaNamespace } from "@prisma/client";

const emptyModules = {
  scamSituation: "",
  scamImpact: "",
  personality: "",
  likedActivities: "",
  expectedRole: "",
  toneStyle: "",
  proactiveLevel: "",
  helpGoals: "",
};

type ManualFlags = Partial<
  Record<keyof typeof emptyModules, boolean>
> | null;

function asManualFlags(v: unknown): ManualFlags {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: ManualFlags = {};
  for (const k of Object.keys(emptyModules) as (keyof typeof emptyModules)[]) {
    if (o[k] === true) (out as Record<string, boolean>)[k] = true;
  }
  return Object.keys(out).length ? out : null;
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法读取基础设定" },
        { status: 401 },
      );
    }

    const [draft, ctx] = await Promise.all([
      prisma.onboardingDraft.findUnique({
        where: { userId },
      }),
      prisma.userSupportContext.findUnique({
        where: { userId },
      }),
    ]);

    return Response.json({
      ok: true,
      draft: draft
        ? {
            currentQuestionIndex: draft.currentQuestionIndex,
            openingAcknowledged: draft.openingAcknowledged,
            isCompleted: draft.isCompleted,
            chatSnapshot: draft.chatSnapshot,
            stepAudit: draft.stepAudit,
          }
        : null,
      supportContext: ctx
        ? {
            ...emptyModules,
            scamSituation: ctx.scamSituation,
            scamImpact: ctx.scamImpact,
            personality: ctx.personality,
            likedActivities: ctx.likedActivities,
            expectedRole: ctx.expectedRole,
            toneStyle: ctx.toneStyle,
            proactiveLevel: ctx.proactiveLevel,
            helpGoals: ctx.helpGoals,
            manualModuleFlags: (ctx.manualModuleFlags as ManualFlags) ?? null,
          }
        : null,
    });
  } catch (e) {
    console.error("onboarding GET:", e);
    return Response.json(
      {
        ok: false,
        error: "Failed to load onboarding",
        details: e instanceof Error ? e.message : "Unknown",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      draft?: {
        currentQuestionIndex?: number;
        openingAcknowledged?: boolean;
        isCompleted?: boolean;
        chatSnapshot?: Prisma.JsonValue;
        stepAudit?: Prisma.JsonValue;
      };
      supportContext?: {
        scamSituation?: string;
        scamImpact?: string;
        personality?: string;
        likedActivities?: string;
        expectedRole?: string;
        toneStyle?: string;
        proactiveLevel?: string;
        helpGoals?: string;
        manualModuleFlags?: unknown;
      };
    };

    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法保存基础设定" },
        { status: 401 },
      );
    }

    if (body.draft) {
      const d = body.draft;
      await prisma.onboardingDraft.upsert({
        where: { userId },
        create: {
          userId,
          currentQuestionIndex: d.currentQuestionIndex ?? 0,
          openingAcknowledged: d.openingAcknowledged ?? false,
          isCompleted: d.isCompleted ?? false,
          chatSnapshot:
            d.chatSnapshot === undefined || d.chatSnapshot === null
              ? PrismaNamespace.JsonNull
              : (d.chatSnapshot as PrismaNamespace.InputJsonValue),
          stepAudit: (d.stepAudit ?? []) as PrismaNamespace.InputJsonValue,
        },
        update: {
          ...(d.currentQuestionIndex !== undefined
            ? { currentQuestionIndex: d.currentQuestionIndex }
            : {}),
          ...(d.openingAcknowledged !== undefined
            ? { openingAcknowledged: d.openingAcknowledged }
            : {}),
          ...(d.isCompleted !== undefined ? { isCompleted: d.isCompleted } : {}),
          ...(d.chatSnapshot !== undefined
            ? { chatSnapshot: d.chatSnapshot as PrismaNamespace.InputJsonValue }
            : {}),
          ...(d.stepAudit !== undefined
            ? { stepAudit: d.stepAudit as PrismaNamespace.InputJsonValue }
            : {}),
        },
      });
    }

    if (body.supportContext) {
      const s = body.supportContext;
      const flags = asManualFlags(s.manualModuleFlags);
      await prisma.userSupportContext.upsert({
        where: { userId },
        create: {
          userId,
          scamSituation: s.scamSituation ?? "",
          scamImpact: s.scamImpact ?? "",
          personality: s.personality ?? "",
          likedActivities: s.likedActivities ?? "",
          expectedRole: s.expectedRole ?? "",
          toneStyle: s.toneStyle ?? "",
          proactiveLevel: s.proactiveLevel ?? "",
          helpGoals: s.helpGoals ?? "",
          manualModuleFlags: flags === null ? undefined : (flags as object),
        },
        update: {
          ...(s.scamSituation !== undefined
            ? { scamSituation: s.scamSituation }
            : {}),
          ...(s.scamImpact !== undefined ? { scamImpact: s.scamImpact } : {}),
          ...(s.personality !== undefined ? { personality: s.personality } : {}),
          ...(s.likedActivities !== undefined
            ? { likedActivities: s.likedActivities }
            : {}),
          ...(s.expectedRole !== undefined
            ? { expectedRole: s.expectedRole }
            : {}),
          ...(s.toneStyle !== undefined ? { toneStyle: s.toneStyle } : {}),
          ...(s.proactiveLevel !== undefined
            ? { proactiveLevel: s.proactiveLevel }
            : {}),
          ...(s.helpGoals !== undefined ? { helpGoals: s.helpGoals } : {}),
          ...(s.manualModuleFlags !== undefined
            ? {
                manualModuleFlags:
                  asManualFlags(s.manualModuleFlags) === null
                    ? undefined
                    : (asManualFlags(s.manualModuleFlags) as object),
              }
            : {}),
        },
      });
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error("onboarding PUT:", e);
    return Response.json(
      {
        ok: false,
        error: "Failed to save onboarding",
        details: e instanceof Error ? e.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
