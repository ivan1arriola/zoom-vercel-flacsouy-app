import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, isAdminAuthorized } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";
import { notifyAdminTelegramMovement } from "@/src/lib/telegram.client";
import { requestUserActivationLink } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const createUserSchema = z.object({
  firstName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email("Email invalido."),
  role: z.nativeEnum(UserRole)
});

const updateUserRoleSchema = z.object({
  userId: z.string().trim().min(1, "userId es obligatorio."),
  role: z.nativeEnum(UserRole)
});

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeNullable(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDisplayName(firstName?: string | null, lastName?: string | null): string | undefined {
  const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
  return name || undefined;
}

export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
      createdAt: true
    }
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminUser = await getSessionUser();

  const json = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
  }

  const email = normalizeEmail(parsed.data.email);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email." }, { status: 409 });
  }

  const firstName = normalizeNullable(parsed.data.firstName);
  const lastName = normalizeNullable(parsed.data.lastName);
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  const user = await db.user.create({
    data: {
      email,
      firstName,
      lastName,
      name,
      role: parsed.data.role,
      passwordHash: null,
      emailVerified: null
    },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
      createdAt: true
    }
  });

  const origin = request.headers.get("origin") ?? undefined;
  const invitedBy =
    buildDisplayName(adminUser?.firstName, adminUser?.lastName) ||
    adminUser?.email ||
    undefined;

  let activationUrl: string | undefined;
  try {
    const activationResult = await requestUserActivationLink({
      email,
      origin,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      invitedBy
    });
    activationUrl = activationResult.activationUrl;
  } catch (error) {
    await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
    const message = error instanceof Error ? error.message : "No se pudo enviar el enlace de activacion.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await notifyAdminTelegramMovement({
    action: "USUARIO_CREADO",
    actorEmail: adminUser?.email,
    actorRole: adminUser?.role,
    entityType: "User",
    entityId: user.id,
    summary: user.email,
    details: {
      role: user.role,
      createdBy: adminUser?.id ?? "",
      activationLinkSent: true
    }
  });

  return NextResponse.json({ ok: true, user, activationUrl }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminUser = await getSessionUser();
  const json = await request.json().catch(() => null);
  const parsed = updateUserRoleSchema.safeParse(json);
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
      emailVerified: true,
      createdAt: true
    }
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  if (adminUser?.id === targetUser.id && parsed.data.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json(
      { error: "No puedes quitarte a ti mismo el rol de administrador desde esta vista." },
      { status: 400 }
    );
  }

  if (targetUser.role === parsed.data.role) {
    return NextResponse.json({ ok: true, user: targetUser });
  }

  const updatedUser = await db.user.update({
    where: { id: targetUser.id },
    data: { role: parsed.data.role },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
      createdAt: true
    }
  });

  await notifyAdminTelegramMovement({
    action: "USUARIO_ROL_ACTUALIZADO",
    actorEmail: adminUser?.email,
    actorRole: adminUser?.role,
    entityType: "User",
    entityId: updatedUser.id,
    summary: updatedUser.email,
    details: {
      roleAnterior: targetUser.role,
      roleNuevo: updatedUser.role,
      updatedBy: adminUser?.id ?? ""
    }
  });

  return NextResponse.json({ ok: true, user: updatedUser });
}
