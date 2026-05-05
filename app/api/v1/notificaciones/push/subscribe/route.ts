import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  }),
  userAgent: z.string().optional()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de suscripcion invalidos" }, { status: 400 });
  }

  const { subscription, userAgent } = parsed.data;

  try {
    await db.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || request.headers.get("user-agent")
      },
      update: {
        userId: user.id,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent: userAgent || request.headers.get("user-agent")
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error al suscribir push:", error);
    return NextResponse.json({ error: "Error interno al guardar suscripcion" }, { status: 500 });
  }
}
