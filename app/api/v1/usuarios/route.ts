import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser, isAdminAuthorized } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";
import { notifyAdminInAppMovement } from "@/src/lib/admin-notifications.client";
import { requestUserActivationLink } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const createUserSchema = z
  .object({
    firstName: z.string().trim().max(80).optional().or(z.literal("")),
    lastName: z.string().trim().max(80).optional().or(z.literal("")),
    email: z.string().trim().email("Email invalido.").optional(),
    emails: z.array(z.string().trim().email("Email invalido.")).min(1).optional(),
    role: z.nativeEnum(UserRole)
  })
  .refine((data) => Boolean(data.email || data.emails?.length), {
    message: "Debes indicar al menos un email.",
    path: ["email"]
  });

const updateUserRoleSchema = z.object({
  userId: z.string().trim().min(1, "userId es obligatorio."),
  role: z.nativeEnum(UserRole),
  emails: z.array(z.string().trim().email("Email invalido.")).min(1).optional()
});
const ASSISTANT_ELIGIBLE_ROLES: UserRole[] = [UserRole.ASISTENTE_ZOOM, UserRole.SOPORTE_ZOOM];

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmails(values: string[]): string[] {
  const unique = new Set<string>();
  for (const value of values) {
    const normalized = normalizeEmail(value);
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique.values());
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

function buildUserAccessEmails(input: { email: string; emailAliases: Array<{ email: string }> }): string[] {
  return Array.from(
    new Set([input.email.trim().toLowerCase(), ...input.emailAliases.map((item) => item.email.trim().toLowerCase())])
  );
}

async function ensureAssistantProfileForRole(userId: string, role: UserRole): Promise<void> {
  if (!ASSISTANT_ELIGIBLE_ROLES.includes(role)) return;

  await db.asistenteZoom.upsert({
    where: { usuarioId: userId },
    update: {},
    create: { usuarioId: userId }
  });
}

export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, latestLoginRows] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        createdAt: true,
        emailAliases: {
          select: {
            email: true
          },
          orderBy: {
            email: "asc"
          }
        }
      }
    }),
    db.notificacion.groupBy({
      by: ["entidadReferenciaId"],
      where: {
        entidadReferenciaTipo: "LOGIN",
        entidadReferenciaId: { not: null }
      },
      _max: {
        createdAt: true
      }
    })
  ]);

  const lastLoginByUserId = new Map<string, string>();
  for (const row of latestLoginRows) {
    const userId = row.entidadReferenciaId;
    const latestAt = row._max.createdAt;
    if (!userId || !latestAt) continue;
    lastLoginByUserId.set(userId, latestAt.toISOString());
  }

  return NextResponse.json({
    users: users.map((user) => ({
      ...user,
      emails: buildUserAccessEmails(user),
      lastLoginAt: lastLoginByUserId.get(user.id) ?? null
    }))
  });
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

  const inputEmails = normalizeEmails(
    parsed.data.emails && parsed.data.emails.length > 0
      ? parsed.data.emails
      : [parsed.data.email ?? ""]
  );
  if (inputEmails.length === 0) {
    return NextResponse.json({ error: "Debes indicar al menos un email." }, { status: 400 });
  }

  const primaryEmail = inputEmails[0] ?? "";
  const aliasEmails = inputEmails.slice(1);

  const [existingPrimary, existingAlias] = await Promise.all([
    db.user.findFirst({
      where: { email: { in: inputEmails } },
      select: { email: true }
    }),
    db.userEmailAlias.findFirst({
      where: { email: { in: inputEmails } },
      select: { email: true }
    })
  ]);

  if (existingPrimary || existingAlias) {
    const duplicated = existingPrimary?.email ?? existingAlias?.email ?? "ese email";
    return NextResponse.json({ error: `Ya existe un usuario con ${duplicated}.` }, { status: 409 });
  }

  const firstName = normalizeNullable(parsed.data.firstName);
  const lastName = normalizeNullable(parsed.data.lastName);
  const name = [firstName, lastName].filter(Boolean).join(" ") || null;

  const user = await db.user.create({
    data: {
      email: primaryEmail,
      firstName,
      lastName,
      name,
      role: parsed.data.role,
      passwordHash: null,
      emailVerified: null,
      ...(aliasEmails.length > 0
        ? {
            emailAliases: {
              createMany: {
                data: aliasEmails.map((email) => ({ email }))
              }
            }
          }
        : {})
    },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
      createdAt: true,
      emailAliases: {
        select: {
          email: true
        },
        orderBy: {
          email: "asc"
        }
      }
    }
  });
  await ensureAssistantProfileForRole(user.id, user.role);

  const origin = request.headers.get("origin") ?? undefined;
  const invitedBy =
    buildDisplayName(adminUser?.firstName, adminUser?.lastName) ||
    adminUser?.email ||
    undefined;

  let activationUrl: string | undefined;
  try {
    const activationResult = await requestUserActivationLink({
      email: primaryEmail,
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

  await notifyAdminInAppMovement({
    action: "USUARIO_CREADO",
    actorEmail: adminUser?.email,
    actorRole: adminUser?.role,
    entityType: "User",
    entityId: user.id,
    summary: user.email,
    details: {
      role: user.role,
      emailsAcceso: buildUserAccessEmails(user),
      createdBy: adminUser?.id ?? "",
      activationLinkSent: true
    }
  });

  return NextResponse.json(
    {
      ok: true,
      user: {
        ...user,
        emails: buildUserAccessEmails(user)
      },
      activationUrl
    },
    { status: 201 }
  );
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
      createdAt: true,
      emailAliases: {
        select: {
          email: true
        },
        orderBy: {
          email: "asc"
        }
      }
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

  const requestedEmails = parsed.data.emails ? normalizeEmails(parsed.data.emails) : null;
  const currentEmails = buildUserAccessEmails(targetUser);
  const shouldUpdateEmails = Boolean(
    requestedEmails &&
      requestedEmails.length > 0 &&
      (requestedEmails.length !== currentEmails.length ||
        requestedEmails.some((email, index) => email !== currentEmails[index]))
  );

  if (targetUser.role === parsed.data.role && !shouldUpdateEmails) {
    return NextResponse.json({
      ok: true,
      user: {
        ...targetUser,
        emails: currentEmails
      }
    });
  }

  if (requestedEmails && requestedEmails.length === 0) {
    return NextResponse.json({ error: "Debes indicar al menos un email." }, { status: 400 });
  }

  if (shouldUpdateEmails && requestedEmails) {
    const [existingPrimary, existingAlias] = await Promise.all([
      db.user.findFirst({
        where: {
          email: { in: requestedEmails },
          id: { not: targetUser.id }
        },
        select: { email: true }
      }),
      db.userEmailAlias.findFirst({
        where: {
          email: { in: requestedEmails },
          userId: { not: targetUser.id }
        },
        select: { email: true }
      })
    ]);

    if (existingPrimary || existingAlias) {
      const duplicated = existingPrimary?.email ?? existingAlias?.email ?? "ese email";
      return NextResponse.json({ error: `El email ${duplicated} ya esta en uso.` }, { status: 409 });
    }
  }

  const updatedUser = await db.$transaction(async (tx) => {
    const nextPrimaryEmail = requestedEmails?.[0];
    const nextAliasEmails = requestedEmails ? requestedEmails.slice(1) : null;

    if (nextPrimaryEmail && nextPrimaryEmail !== targetUser.email) {
      await tx.userEmailAlias.deleteMany({
        where: {
          userId: targetUser.id,
          email: nextPrimaryEmail
        }
      });
    }

    await tx.user.update({
      where: { id: targetUser.id },
      data: {
        role: parsed.data.role,
        ...(nextPrimaryEmail ? { email: nextPrimaryEmail } : {})
      }
    });

    if (nextAliasEmails) {
      if (nextAliasEmails.length === 0) {
        await tx.userEmailAlias.deleteMany({
          where: {
            userId: targetUser.id
          }
        });
      } else {
        await tx.userEmailAlias.deleteMany({
          where: {
            userId: targetUser.id,
            email: {
              notIn: nextAliasEmails
            }
          }
        });
      }

      for (const aliasEmail of nextAliasEmails) {
        await tx.userEmailAlias.upsert({
          where: { email: aliasEmail },
          create: {
            userId: targetUser.id,
            email: aliasEmail
          },
          update: {
            userId: targetUser.id
          }
        });
      }
    }

    return tx.user.findUniqueOrThrow({
      where: { id: targetUser.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        emailVerified: true,
        createdAt: true,
        emailAliases: {
          select: {
            email: true
          },
          orderBy: {
            email: "asc"
          }
        }
      }
    });
  });
  await ensureAssistantProfileForRole(updatedUser.id, updatedUser.role);

  await notifyAdminInAppMovement({
    action: "USUARIO_ROL_ACTUALIZADO",
    actorEmail: adminUser?.email,
    actorRole: adminUser?.role,
    entityType: "User",
    entityId: updatedUser.id,
    summary: updatedUser.email,
    details: {
      roleAnterior: targetUser.role,
      roleNuevo: updatedUser.role,
      emailsAcceso: buildUserAccessEmails(updatedUser),
      updatedBy: adminUser?.id ?? ""
    }
  });

  return NextResponse.json({
    ok: true,
    user: {
      ...updatedUser,
      emails: buildUserAccessEmails(updatedUser)
    }
  });
}
