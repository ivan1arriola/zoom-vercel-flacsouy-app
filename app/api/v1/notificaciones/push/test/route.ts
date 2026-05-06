import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { getVapidPublicKey, sendPushToUser } from "@/src/lib/push";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!getVapidPublicKey()) {
    return NextResponse.json(
      { error: "Las notificaciones push no estan configuradas en el servidor." },
      { status: 503 }
    );
  }

  const sent = await sendPushToUser(user.id, {
    title: "Prueba de notificaciones FLACSO",
    body: "Si ves este mensaje, las notificaciones del navegador funcionan correctamente.",
    url: "/?tab=notificaciones",
    tag: "flacso-push-test"
  });

  if (sent.count === 0) {
    return NextResponse.json(
      { error: "No tienes suscripciones push activas en este navegador." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    sentCount: sent.count,
    message: `Notificacion de prueba enviada a ${sent.count} dispositivo(s).`
  });
}
