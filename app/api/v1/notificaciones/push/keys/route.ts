import { NextResponse } from "next/server";
import { getVapidConfigStatus, getVapidPublicKey } from "@/src/lib/push";
import { getSessionUser } from "@/src/lib/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    const vapidStatus = getVapidConfigStatus();
    return NextResponse.json(
      {
        error:
          "Notificaciones push no configuradas en el servidor. Faltan variables VAPID en el entorno.",
        missingEnv: vapidStatus.missingEnv
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}
