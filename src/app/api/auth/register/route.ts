import { prisma } from "@/lib/prisma";
import { hashPassword, setLoginSession } from "@/lib/auth";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const username = asString(body.username).trim();
    const password = asString(body.password);
    const gender = asString(body.gender).trim();
    const age = asString(body.age).trim();
    const education = asString(body.education).trim();
    const jobType = asString(body.jobType).trim();
    const scammedAmount = asString(body.scammedAmount).trim();
    const scamWhen = asString(body.scamWhen).trim();
    const scamType = asString(body.scamType).trim();

    if (!username) {
      return Response.json({ ok: false, error: "用户名不能为空" }, { status: 400 });
    }
    if (!password) {
      return Response.json({ ok: false, error: "密码不能为空" }, { status: 400 });
    }
    if (!gender || !age || !education || !jobType || !scammedAmount || !scamWhen || !scamType) {
      return Response.json(
        { ok: false, error: "请把所有必填信息填写完整" },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (existing) {
      return Response.json({ ok: false, error: "这个用户名已经被占用，请换一个" }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        gender,
        age,
        education,
        jobType,
        scammedAmount,
        scamWhen,
        scamType,
      },
      select: { id: true, username: true },
    });

    await setLoginSession(user.id);

    return Response.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("register POST:", error);
    return Response.json(
      {
        ok: false,
        error: "注册失败，请稍后再试",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

