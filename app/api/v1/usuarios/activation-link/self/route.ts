import { NextResponse } from "next/server";
import { getSessionUser, isAdminAuthorized } from "@/src/lib/api-auth";
import { notifyAdminTelegramMovement } from "@/src/lib/telegram.client";
import { requestUserActivationLink } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

function buildDisplayName(firstName?: string | null, lastName?: string | null): string | undefined {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return name || undefined;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.headers.get("origin") ?? undefined;

  try {
    const result = await requestUserActivationLink({
      email: user.email,
      origin,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      invitedBy: buildDisplayName(user.firstName, user.lastName) || user.email
    });

    await notifyAdminTelegramMovement({
      action: "USUARIO_ENVIO_ACTIVACION_SELF_TEST",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "User",
      entityId: user.id,
      summary: user.email,
      details: {
        selfTest: true
      }
    });

    return NextResponse.json({
      ok: true,
      activationUrl: result.activationUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el enlace de prueba.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
