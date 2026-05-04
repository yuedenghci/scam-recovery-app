const SHANGHAI = "Asia/Shanghai";

/** YYYY-MM-DD in Asia/Shanghai (no reliance on runtime local TZ). */
export function getShanghaiDayKey(date: Date = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  let year = "";
  let month = "";
  let day = "";
  for (const p of parts) {
    if (p.type === "year") year = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "day") day = p.value;
  }
  if (!year || !month || !day) {
    throw new Error("getShanghaiDayKey: Intl formatToParts failed");
  }
  return `${year}-${month}-${day}`;
}

/** Shanghai local midnight as a UTC Instant (DST-free for Asia/Shanghai). */
export function getShanghaiStartOfDay(date: Date = new Date()): Date {
  const dayKey = getShanghaiDayKey(date);
  return new Date(`${dayKey}T00:00:00+08:00`);
}

/** Start of the *next* Shanghai calendar day (for Prisma `lt` upper bound). */
export function getShanghaiEndOfDay(date: Date = new Date()): Date {
  return new Date(getShanghaiStartOfDay(date).getTime() + 24 * 60 * 60 * 1000);
}
