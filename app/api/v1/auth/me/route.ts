import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profileComplete = Boolean(user.firstName && user.lastName && user.email);
  return NextResponse.json({ user, profileComplete });
}
