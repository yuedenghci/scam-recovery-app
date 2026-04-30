import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const messageId = url.searchParams.get("messageId");
  if (!messageId || typeof messageId !== "string") {
    return Response.json({ ok: false, error: "Invalid messageId" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, suggestedAction: true },
  });

  if (!msg || msg.userId !== userId) {
    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return Response.json({
    ok: true,
    suggestedAction: msg.suggestedAction ?? null,
  });
}

