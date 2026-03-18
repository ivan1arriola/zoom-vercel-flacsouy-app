import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { EmailClient } from "@/src/lib/email.client";

const FLACSO_DOMAIN = "@flacso.edu.uy";
const ADMIN_EMAIL = "web@flacso.edu.uy";
const PENDING_KEY_PREFIX = "auth:registration:pending:";
const TOKEN_TTL_MINUTES = 30;
const PASSWORD_RECOVERY_TTL_MINUTES = 30;

const pendingRegistrationSchema = z.object({
  token: z.string().min(1),
  passwordHash: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  expiresAt: z.string().datetime()
});

export type RequestRegistrationInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  origin?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function assertFlacsoEmail(email: string): void {
  if (!email.endsWith(FLACSO_DOMAIN)) {
    throw new Error("Solo se permiten correos @flacso.edu.uy.");
  }
}

function getPendingKey(email: string): string {
  return `${PENDING_KEY_PREFIX}${email}`;
}

function getPublicBaseUrl(origin?: string): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL;
  if (origin) return origin;
  return "http://localhost:3000";
}

export async function requestFlacsoRegistration(input: RequestRegistrationInput): Promise<{ verificationUrl?: string }> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const firstName = input.firstName?.trim() || undefined;
  const lastName = input.lastName?.trim() || undefined;
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || undefined;

  if (password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }

  assertFlacsoEmail(email);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.emailVerified) {
    throw new Error("Ese correo ya está registrado.");
  }

  const token = crypto.randomBytes(24).toString("hex");
  const passwordHash = await bcrypt.hash(password, 12);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

  await db.appSetting.upsert({
    where: { key: getPendingKey(email) },
    create: {
      key: getPendingKey(email),
      value: { token, passwordHash, firstName, lastName, expiresAt }
    },
    update: {
      value: { token, passwordHash, firstName, lastName, expiresAt }
    }
  });

  const baseUrl = getPublicBaseUrl(input.origin);
  const verificationUrl = `${baseUrl}/?verify=${token}&email=${encodeURIComponent(email)}`;

  const emailClient = new EmailClient();
  await emailClient.send({
    to: email,
    subject: "Confirma tu registro en Plataforma Zoom FLACSO",
    html: `
      <p>Hola${fullName ? ` ${fullName}` : ""},</p>
      <p>Recibimos una solicitud de registro para la Plataforma Zoom de FLACSO Uruguay.</p>
      <p>Para demostrar que eres dueño de esta cuenta y activar tu acceso, haz clic en este enlace:</p>
      <p><a href="${verificationUrl}">Confirmar correo y activar cuenta</a></p>
      <p>Este enlace vence en ${TOKEN_TTL_MINUTES} minutos.</p>
      <p>Si no solicitaste esto, puedes ignorar este mensaje.</p>
    `
  });

  if (env.NODE_ENV !== "production") {
    return { verificationUrl };
  }

  return {};
}

export async function verifyFlacsoRegistration(emailRaw: string, token: string): Promise<void> {
  const email = normalizeEmail(emailRaw);
  assertFlacsoEmail(email);

  const pending = await db.appSetting.findUnique({ where: { key: getPendingKey(email) } });
  if (!pending?.value || typeof pending.value !== "object") {
    throw new Error("Registro pendiente no encontrado o vencido.");
  }

  const parsed = pendingRegistrationSchema.safeParse(pending.value);
  if (!parsed.success) {
    throw new Error("Registro pendiente inválido.");
  }

  if (parsed.data.token !== token) {
    throw new Error("Token de verificación inválido.");
  }

  const expiresAt = new Date(parsed.data.expiresAt);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt.getTime() < Date.now()) {
    throw new Error("El token de verificación está vencido.");
  }

  await db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    const combinedName = [parsed.data.firstName, parsed.data.lastName].filter(Boolean).join(" ") || undefined;
    const role = email === ADMIN_EMAIL ? UserRole.ADMINISTRADOR : UserRole.DOCENTE;

    await tx.user.upsert({
      where: { email },
      create: {
        email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: combinedName,
        passwordHash: parsed.data.passwordHash,
        emailVerified: new Date(),
        role
      },
      update: {
        passwordHash: parsed.data.passwordHash,
        emailVerified: new Date(),
        role,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: combinedName ?? existing?.name
      }
    });

    await tx.appSetting.delete({ where: { key: getPendingKey(email) } });
  });
}

export async function requestPasswordRecovery(emailRaw: string, origin?: string): Promise<{ resetUrl?: string }> {
  const email = normalizeEmail(emailRaw);
  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    return {};
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + PASSWORD_RECOVERY_TTL_MINUTES * 60_000);

  await db.verificationToken.deleteMany({ where: { identifier: email } });
  await db.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires
    }
  });

  const baseUrl = getPublicBaseUrl(origin);
  const resetUrl = `${baseUrl}/?resetToken=${token}&email=${encodeURIComponent(email)}`;

  const emailClient = new EmailClient();
  await emailClient.send({
    to: email,
    subject: "Recuperación de contraseña | Plataforma Zoom FLACSO",
    html: `
      <p>Hola,</p>
      <p>Recibimos una solicitud para cambiar tu contraseña.</p>
      <p>Para continuar, usa este enlace:</p>
      <p><a href="${resetUrl}">Restablecer contraseña</a></p>
      <p>Este enlace vence en ${PASSWORD_RECOVERY_TTL_MINUTES} minutos.</p>
      <p>Si no fuiste tú, puedes ignorar este mensaje.</p>
    `
  });

  if (env.NODE_ENV !== "production") {
    return { resetUrl };
  }

  return {};
}

export async function confirmPasswordRecovery(
  emailRaw: string,
  token: string,
  newPassword: string
): Promise<void> {
  const email = normalizeEmail(emailRaw);

  if (newPassword.length < 8) {
    throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
  }

  const recovery = await db.verificationToken.findUnique({
    where: {
      identifier_token: {
        identifier: email,
        token
      }
    }
  });

  if (!recovery) {
    throw new Error("Token inválido o inexistente.");
  }

  if (recovery.expires.getTime() < Date.now()) {
    await db.verificationToken.deleteMany({ where: { identifier: email } });
    throw new Error("El token de recuperación está vencido.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.$transaction([
    db.user.update({
      where: { email },
      data: {
        passwordHash,
        emailVerified: new Date()
      }
    }),
    db.verificationToken.deleteMany({ where: { identifier: email } })
  ]);
}
