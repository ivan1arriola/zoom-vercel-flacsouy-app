import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

const unsubscribeSchema = z.object({
  endpoint: z.string().url()
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const parsed = unsubscribeSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Endpoint invalido" }, { status: 400 });
  }

  try {
    await db.pushSubscription.deleteMany({
      where: {
        endpoint: parsed.data.endpoint,
        userId: user.id
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error al desuscribir push:", error);
    return NextResponse.json({ error: "Error al eliminar suscripcion" }, { status: 500 });
  }
}
