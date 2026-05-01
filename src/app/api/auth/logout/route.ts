import { clearLoginSession } from "@/lib/auth";

export async function POST() {
  await clearLoginSession();
  return Response.json({ ok: true });
}
