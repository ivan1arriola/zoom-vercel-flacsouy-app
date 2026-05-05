import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/src/lib/push";
import { getSessionUser } from "@/src/lib/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 });
  }

  return NextResponse.json({ publicKey });
}
