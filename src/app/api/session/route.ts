import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json({ ok: false, user: null }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        gender: true,
        age: true,
        education: true,
        jobType: true,
        scammedAmount: true,
        scamWhen: true,
        scamType: true,
      },
    });

    if (!user) {
      return Response.json({ ok: false, user: null }, { status: 401 });
    }

    return Response.json({ ok: true, user });
  } catch (error) {
    console.error("session GET:", error);
    return Response.json(
      {
        ok: false,
        error: "获取登录状态失败",
        user: null,
      },
      { status: 500 },
    );
  }
}

