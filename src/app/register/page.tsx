"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [education, setEducation] = useState("");
  const [jobType, setJobType] = useState("");
  const [scammedAmount, setScammedAmount] = useState("");
  const [scamWhen, setScamWhen] = useState("");
  const [scamType, setScamType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          gender,
          age,
          education,
          jobType,
          scammedAmount,
          scamWhen,
          scamType,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "注册失败，请稍后再试");
        return;
      }

      // 注册成功后默认进入 onboarding，后续由首页路由判断是否已完成。
      try {
        const obRes = await fetch("/api/onboarding", { method: "GET" });
        if (obRes.ok) {
          const obData = (await obRes.json().catch(() => ({}))) as {
            ok?: boolean;
            draft?: { isCompleted?: boolean } | null;
          };
          const completed = !!obData?.draft?.isCompleted;
          router.push(completed ? "/chat" : "/onboarding");
          return;
        }
      } catch {
        // 忽略错误，走默认路径
      }

      router.push("/onboarding");
    } catch {
      setError("注册失败，请检查网络后再试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f7f4ef] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.75rem,env(safe-area-inset-top))] sm:py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white/95 p-6 shadow-sm border border-stone-200/70">
        <h1 className="mb-2 text-xl font-semibold text-stone-900">注册</h1>
        <p className="mb-6 text-sm text-stone-600">
          这些信息只会用于提供更贴近你情况的支持，不会对外泄露。
        </p>

        <form
          className="space-y-4"
          method="post"
          //inert={!mounted}
          onSubmit={handleSubmit}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              用户名（登录用）*
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              密码*
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-800">
                性别*
              </label>
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-800">
                年龄*
              </label>
              <input
                className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              已获得的学历*
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={education}
              onChange={(e) => setEducation(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              工作类型（如果是学生可写“学生”）*
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              被诈骗了多少钱（可大概填写）*
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={scammedAmount}
              onChange={(e) => setScammedAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              大概是什么时候发生的？*
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={scamWhen}
              onChange={(e) => setScamWhen(e.target.value)}
              placeholder="例如：2023 年底 / 今年 3 月"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-800">
              诈骗类型（自由填写）*
            </label>
            <input
              className="w-full rounded-lg border border-stone-300 px-3 py-3 text-base outline-none focus:border-stone-500 focus:ring-2 focus:ring-stone-200 sm:py-2 sm:text-sm"
              value={scamType}
              onChange={(e) => setScamType(e.target.value)}
              placeholder="例如：杀猪盘 / 投资理财 / 兼职刷单……"
            />
          </div>

          {error ? (
            <p className="text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 min-h-[48px] w-full rounded-xl bg-stone-800 py-3 text-sm font-medium text-stone-50 shadow-sm transition-colors hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:py-2.5"
          >
            {submitting ? "注册中…" : "注册并进入系统"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/login")}
            className="w-full text-center text-xs text-stone-500 hover:text-stone-700"
          >
            已有账号？去登录
          </button>
        </form>
      </div>
    </main>
  );
}

