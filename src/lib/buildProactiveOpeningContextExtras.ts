import { prisma } from "@/lib/prisma";

/** 轻量附带上下文，供 proactive opening 末条 user 提示使用（非必需）。 */
export async function buildProactiveSupplementaryContext(
  userId: string,
): Promise<string> {
  const parts: string[] = [];

  const [recovery, diary, letter] = await Promise.all([
    prisma.dailyRecovery.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      select: {
        recoveryDomain: true,
        customDomain: true,
        difficultyNote: true,
        currentTaskText: true,
      },
    }),
    prisma.diaryEntry.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { entryDay: true, content: true },
    }),
    prisma.progressLetter.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { title: true, body: true },
    }),
  ]);

  if (recovery) {
    const domain =
      recovery.customDomain?.trim() || recovery.recoveryDomain || "";
    const task = recovery.currentTaskText?.trim() || "";
    const diff = recovery.difficultyNote?.replace(/\s+/g, " ").trim() || "";
    if (domain || task || diff) {
      parts.push(
        [
          "日常恢复（最近一条）",
          domain ? `领域：${domain}` : "",
          task ? `当前小步：${task}` : "",
          diff ? `困难说明摘要：${diff.slice(0, 200)}` : "",
        ]
          .filter(Boolean)
          .join("；"),
      );
    }
  }

  if (diary?.content?.trim()) {
    const snippet = diary.content.replace(/\s+/g, " ").trim().slice(0, 240);
    parts.push(`日记（${diary.entryDay}）摘录：${snippet}`);
  }

  if (letter?.title) {
    const bodySnippet = (letter.body ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 320);
    parts.push(`进度来信标题：${letter.title}${bodySnippet ? `；摘录：${bodySnippet}` : ""}`);
  }

  return parts.join("\n");
}
