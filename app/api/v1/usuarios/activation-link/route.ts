import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, isAdminAuthorized } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";
import { notifyAdminTelegramMovement } from "@/src/lib/telegram.client";
import { requestUserActivationLink } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const resendActivationSchema = z.object({
  userId: z.string().trim().min(1, "userId es obligatorio.")
});

function buildDisplayName(firstName?: string | null, lastName?: string | null): string | undefined {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return name || undefined;
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminUser = await getSessionUser();
  const json = await request.json().catch(() => null);
  const parsed = resendActivationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      emailVerified: true
    }
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  if (targetUser.passwordHash && targetUser.emailVerified) {
    return NextResponse.json(
      { error: "El usuario ya tiene la cuenta activa. Usa recuperacion de contrasena si corresponde." },
      { status: 400 }
    );
  }

  const origin = request.headers.get("origin") ?? undefined;
  const invitedBy =
    buildDisplayName(adminUser?.firstName, adminUser?.lastName) ||
    adminUser?.email ||
    undefined;

  try {
    await requestUserActivationLink({
      email: targetUser.email,
      origin,
      firstName: targetUser.firstName ?? undefined,
      lastName: targetUser.lastName ?? undefined,
      invitedBy
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el enlace de activacion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await notifyAdminTelegramMovement({
    action: "USUARIO_REENVIO_ACTIVACION",
    actorEmail: adminUser?.email,
    actorRole: adminUser?.role,
    entityType: "User",
    entityId: targetUser.id,
    summary: targetUser.email,
    details: {
      resentBy: adminUser?.id ?? ""
    }
  });

  return NextResponse.json({ ok: true });
}
