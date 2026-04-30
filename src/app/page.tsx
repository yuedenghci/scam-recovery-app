import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export default async function HomePage() {
  const userId = await getCurrentUserId();

  // 未登录用户：统一进入登录页
  if (!userId) {
    redirect("/login");
  }

  // 已登录用户：根据 onboarding 完成情况分流
  // 这里用 any 是为了兼容当前生成的 Prisma Client 类型定义
  const draft = await (prisma as any).onboardingDraft.findUnique({
    where: { userId },
    select: { isCompleted: true },
  });

  if (!draft || !draft.isCompleted) {
    redirect("/onboarding");
  }

  redirect("/chat");
}
