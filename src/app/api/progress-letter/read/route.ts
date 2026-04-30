import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法标记已读" },
        { status: 401 },
      );
    }
    const body = (await request.json()) as { letterId?: unknown };
    const letterId = asString(body.letterId).trim();
    if (!letterId) {
      return Response.json({ ok: false, error: "缺少信件 ID" }, { status: 400 });
    }

    await prisma.progressLetter.updateMany({
      where: { id: letterId, userId },
      data: { isRead: true, readAt: new Date() },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("progress-letter/read POST:", error);
    return Response.json(
      {
        ok: false,
        error: "标记已读失败",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
