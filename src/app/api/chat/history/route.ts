import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ChatRole = "user" | "assistant";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录", messages: [] },
        { status: 401 },
      );
    }

    const rows = await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 80,
      select: {
        id: true,
        role: true,
        content: true,
        suggestedAction: true,
        mode: true,
        createdAt: true,
      },
    });

    rows.reverse();

    const messages = rows.flatMap((row) => {
      if (row.role !== "user" && row.role !== "assistant") return [];
      const role = row.role as ChatRole;
      const sug =
        typeof row.suggestedAction === "string" && row.suggestedAction.trim() !== ""
          ? row.suggestedAction.trim()
          : null;
      const mode =
        typeof row.mode === "string" && row.mode.trim() !== ""
          ? row.mode.trim()
          : null;
      return [
        {
          id: row.id,
          role,
          text: row.content,
          ...(sug ? { suggestedAction: sug } : {}),
          ...(mode ? { mode } : {}),
          createdAt: row.createdAt.toISOString(),
        },
      ];
    });

    return Response.json({ ok: true, messages });
  } catch (error) {
    console.error("chat/history GET:", error);
    return Response.json(
      {
        ok: false,
        error: "加载聊天记录失败",
        messages: [],
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
