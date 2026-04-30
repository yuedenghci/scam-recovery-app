import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";

/** Turn JSON into a string array (empty if not an array). */
function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === "string" ? item : String(item)))
}

/** Required string field from JSON. */
function asString(value: unknown): string {
  if (typeof value === "string") return value
  if (value === undefined || value === null) return ""
  return String(value)
}

/** Optional string: null when missing, empty, or not provided. */
function nullIfEmpty(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const s = typeof value === "string" ? value : String(value)
  return s === "" ? null : s
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json({ ok: true, profile: null }, { status: 200 });
    }
    const row = await prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!row) {
      return Response.json({ ok: true, profile: null });
    }

    return Response.json({
      ok: true,
      profile: {
        preferredSupportFocus: row.preferredSupportFocus,
        preferredToneStyle: row.preferredToneStyle,
        responseSpecificityPreference: row.responseSpecificityPreference,
        contactPreference: row.contactPreference,
        contactTimeWindow: row.contactTimeWindow,
        contactFrequency: row.contactFrequency,
        comfortingActivities: row.comfortingActivities,
        comfortingActivitiesOther: row.comfortingActivitiesOther,
      },
    });
  } catch (error) {
    console.error("Failed to load profile:", error);
    return Response.json(
      {
        ok: false,
        error: "Failed to load profile",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return Response.json(
        { ok: false, error: "未登录，无法保存偏好设定" },
        { status: 401 },
      );
    }
    const body = await request.json();

    console.log("Profile request body:", body);

    const preferredSupportFocus = asStringArray(body.preferredSupportFocus);
    const comfortingActivities = asStringArray(body.comfortingActivities);
    const preferredToneStyle = asString(body.preferredToneStyle);
    const responseSpecificityPreference = asString(
      body.responseSpecificityPreference,
    );
    const contactPreference = asString(body.contactPreference);
    const contactTimeWindow = nullIfEmpty(body.contactTimeWindow);
    const contactFrequency = nullIfEmpty(body.contactFrequency);
    const comfortingActivitiesOther = nullIfEmpty(
      body.comfortingActivitiesOther,
    );

    const profileData = {
      preferredSupportFocus,
      preferredToneStyle,
      responseSpecificityPreference,
      contactPreference,
      contactTimeWindow,
      contactFrequency,
      comfortingActivities,
      comfortingActivitiesOther,
    };

    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...profileData,
      },
      update: profileData,
    });

    return Response.json({ ok: true, message: "Profile saved" });
  } catch (error) {
    console.error("Failed to save profile:", error);
    return Response.json(
      {
        ok: false,
        error: "Failed to save profile",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
