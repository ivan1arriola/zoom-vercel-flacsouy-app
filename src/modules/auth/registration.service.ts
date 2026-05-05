import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/src/lib/db";
import { EmailClient } from "@/src/lib/email.client";
import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";

const ADMIN_EMAIL = "web@flacso.edu.uy";
const PENDING_KEY_PREFIX = "auth:registration:pending:";
const TOKEN_TTL_MINUTES = 60 * 24 * 7;
const PASSWORD_RECOVERY_LINK_TTL_MINUTES = 30;
const ACCOUNT_ACTIVATION_LINK_TTL_MINUTES = 60 * 24 * 7;

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

type PasswordLinkPurpose = "recovery" | "activation";
export type ConfirmPasswordMode = PasswordLinkPurpose;

type RequestPasswordLinkInput = {
  email: string;
  origin?: string;
  purpose: PasswordLinkPurpose;
  firstName?: string;
  lastName?: string;
  invitedBy?: string;
};

export type RequestUserActivationInput = {
  email: string;
  origin?: string;
  firstName?: string;
  lastName?: string;
  invitedBy?: string;
};

type EmailTemplateInput = {
  baseUrl: string;
  preheader: string;
  title: string;
  kicker?: string;
  greeting: string;
  paragraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
  metaLines?: string[];
  footerLine?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getPendingKey(email: string): string {
  return `${PENDING_KEY_PREFIX}${email}`;
}

function getPublicBaseUrl(origin?: string): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL;
  if (origin) return origin;
  return "http://localhost:3000";
}

function getDisplayName(firstName?: string, lastName?: string): string | undefined {
  const normalizedFirstName = firstName?.trim() || "";
  const normalizedLastName = lastName?.trim() || "";
  const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ").trim();
  return fullName || undefined;
}

function getPasswordLinkTtlMinutes(purpose: PasswordLinkPurpose): number {
  return purpose === "activation"
    ? ACCOUNT_ACTIVATION_LINK_TTL_MINUTES
    : PASSWORD_RECOVERY_LINK_TTL_MINUTES;
}

function formatTtlLabel(ttlMinutes: number): string {
  if (ttlMinutes % (60 * 24) === 0) {
    const days = ttlMinutes / (60 * 24);
    return `${days} dia${days === 1 ? "" : "s"}`;
  }
  if (ttlMinutes % 60 === 0) {
    const hours = ttlMinutes / 60;
    return `${hours} hora${hours === 1 ? "" : "s"}`;
  }
  return `${ttlMinutes} minutos`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailLayout(input: EmailTemplateInput): string {
  const logoUrl = `${input.baseUrl.replace(/\/$/, "")}/flacso-logo.png`;
  const preheader = escapeHtml(input.preheader);
  const title = escapeHtml(input.title);
  const kicker = escapeHtml(input.kicker ?? "Plataforma Zoom de FLACSO Uruguay");
  const greeting = escapeHtml(input.greeting);
  const paragraphs = input.paragraphs
    .map((line) => `<p style=\"margin:0 0 14px 0;color:#223042;font-size:16px;line-height:1.6;\">${escapeHtml(line)}</p>`)
    .join("\n");

  const actionBlock =
    input.actionLabel && input.actionUrl
      ? `
      <table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin:20px 0 16px 0;\">
        <tr>
          <td align=\"center\" style=\"border-radius:10px;background:#1d3a72;\">
            <a href=\"${escapeHtml(input.actionUrl)}\" style=\"display:inline-block;padding:13px 20px;font-weight:700;font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;\">${escapeHtml(input.actionLabel)}</a>
          </td>
        </tr>
      </table>
      <p style=\"margin:0 0 14px 0;color:#536074;font-size:13px;line-height:1.5;\">Si el boton no funciona, copia y pega este enlace:<br/><a href=\"${escapeHtml(input.actionUrl)}\" style=\"color:#1d3a72;word-break:break-all;\">${escapeHtml(input.actionUrl)}</a></p>
    `
      : "";

  const metaBlock =
    input.metaLines && input.metaLines.length > 0
      ? `<table role=\"presentation\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin:8px 0 0 0;\">${input.metaLines
          .map(
            (line) =>
              `<tr><td style=\"padding:0 8px 8px 0;color:#1d3a72;font-size:14px;\">•</td><td style=\"padding:0 0 8px 0;color:#425066;font-size:14px;line-height:1.5;\">${escapeHtml(line)}</td></tr>`
          )
          .join("")}</table>`
      : "";

  const footerLine = escapeHtml(
    input.footerLine ??
      "Este es un mensaje automatico de FLACSO Uruguay. Si no reconoces esta accion, ignora este correo."
  );

  return `
<!doctype html>
<html lang=\"es\">
  <body style=\"margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;\">
    <div style=\"display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;\">${preheader}</div>
    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#f3f6fb;padding:20px 10px;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" width=\"640\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;width:100%;border-collapse:collapse;\">
            <tr>
              <td style=\"border-radius:14px 14px 0 0;padding:20px 24px;background:linear-gradient(135deg,#1d3a72,#254c95);\">
                <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">
                  <tr>
                    <td style=\"vertical-align:middle;\">
                      <img src=\"${escapeHtml(logoUrl)}\" alt=\"FLACSO Uruguay\" style=\"height:44px;display:block;\" />
                    </td>
                  </tr>
                </table>
                <p style=\"margin:18px 0 6px 0;color:#cfd8ea;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;\">${kicker}</p>
                <h1 style=\"margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:800;\">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style=\"background:#ffffff;padding:26px 24px;border-left:1px solid #dbe3f0;border-right:1px solid #dbe3f0;\">
                <p style=\"margin:0 0 14px 0;color:#223042;font-size:16px;line-height:1.6;font-weight:700;\">${greeting}</p>
                ${paragraphs}
                ${actionBlock}
                ${metaBlock}
              </td>
            </tr>
            <tr>
              <td style=\"background:#eef3fb;padding:16px 24px;border:1px solid #dbe3f0;border-top:0;border-radius:0 0 14px 14px;\">
                <p style=\"margin:0;color:#5c697e;font-size:12px;line-height:1.5;\">${footerLine}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

async function createPasswordLinkToken(email: string, ttlMinutes: number): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + ttlMinutes * 60_000);

  await db.verificationToken.deleteMany({ where: { identifier: email } });
  await db.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires
    }
  });

  return token;
}

function buildPasswordLinkEmail(input: {
  baseUrl: string;
  purpose: PasswordLinkPurpose;
  resetUrl: string;
  ttlMinutes: number;
  firstName?: string;
  lastName?: string;
  invitedBy?: string;
}): { subject: string; html: string } {
  const fullName = getDisplayName(input.firstName, input.lastName);
  const greeting = fullName ? `Hola ${fullName},` : "Hola,";

  if (input.purpose === "activation") {
    const invitedBy = input.invitedBy?.trim();
    return {
      subject: "Activa tu cuenta | Plataforma Zoom de FLACSO Uruguay",
      html: buildEmailLayout({
        baseUrl: input.baseUrl,
        preheader: "Activa tu cuenta de Plataforma Zoom de FLACSO Uruguay.",
        title: "Activa tu cuenta",
        greeting,
      paragraphs: [
        "Se creo tu cuenta en la Plataforma Zoom de FLACSO Uruguay.",
        invitedBy
          ? `La cuenta fue creada por ${invitedBy}. Para completar el alta, activa tu acceso desde este enlace.`
          : "Para completar el alta, activa tu acceso desde este enlace.",
        "Tambien puedes ingresar directamente con tu cuenta de Google en el sistema."
      ],
        actionLabel: "Activar cuenta y definir contrasena",
        actionUrl: input.resetUrl,
        metaLines: [
          `Este enlace vence en ${formatTtlLabel(input.ttlMinutes)}.`,
          "Una vez activada tu cuenta, podras iniciar sesion normalmente."
        ]
      })
    };
  }

  return {
    subject: "Recuperacion de contrasena | Plataforma Zoom de FLACSO Uruguay",
    html: buildEmailLayout({
      baseUrl: input.baseUrl,
      preheader: "Recibimos una solicitud para cambiar tu contrasena.",
      title: "Restablece tu contrasena",
      greeting,
      paragraphs: [
        "Recibimos una solicitud para cambiar la contrasena de tu cuenta.",
        "Para continuar, usa el siguiente enlace seguro."
      ],
      actionLabel: "Restablecer contrasena",
      actionUrl: input.resetUrl,
      metaLines: [
        `Este enlace vence en ${formatTtlLabel(input.ttlMinutes)}.`,
        "Si no hiciste esta solicitud, ignora este mensaje."
      ]
    })
  };
}

function buildRegistrationVerificationEmail(input: {
  baseUrl: string;
  verificationUrl: string;
  firstName?: string;
  lastName?: string;
}): { subject: string; html: string } {
  const fullName = getDisplayName(input.firstName, input.lastName);
  const greeting = fullName ? `Hola ${fullName},` : "Hola,";

  return {
    subject: "Confirma tu registro | Plataforma Zoom de FLACSO Uruguay",
    html: buildEmailLayout({
      baseUrl: input.baseUrl,
      preheader: "Confirma tu correo para activar tu registro.",
      title: "Confirma tu registro",
      greeting,
      paragraphs: [
        "Recibimos una solicitud de registro para la Plataforma Zoom de FLACSO Uruguay.",
        "Para demostrar que eres dueno de esta cuenta, confirma tu correo con el siguiente enlace."
      ],
      actionLabel: "Confirmar correo y activar cuenta",
      actionUrl: input.verificationUrl,
      metaLines: [`Este enlace vence en ${formatTtlLabel(TOKEN_TTL_MINUTES)}.`]
    })
  };
}

function buildAccountConfirmedEmail(input: {
  baseUrl: string;
  firstName?: string;
  lastName?: string;
}): { subject: string; html: string } {
  const fullName = getDisplayName(input.firstName, input.lastName);
  const greeting = fullName ? `Hola ${fullName},` : "Hola,";
  const loginUrl = `${input.baseUrl.replace(/\/$/, "")}/`;

  return {
    subject: "Cuenta activada correctamente | Plataforma Zoom de FLACSO Uruguay",
    html: buildEmailLayout({
      baseUrl: input.baseUrl,
      preheader: "Tu cuenta ya quedo activada.",
      title: "Cuenta confirmada",
      greeting,
      paragraphs: [
        "Tu cuenta fue activada correctamente.",
        "Ya puedes ingresar a la plataforma con tu correo y la contrasena que acabas de definir.",
        "Tambien puedes ingresar con Google."
      ],
      actionLabel: "Ir a la plataforma",
      actionUrl: loginUrl,
      metaLines: ["Si no reconoces esta accion, contacta al equipo de soporte de FLACSO Uruguay."]
    })
  };
}

async function findUserByAnyEmail(email: string): Promise<{
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  matchedEmail: string;
} | null> {
  const primary = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, lastName: true }
  });
  if (primary) {
    return { user: primary, matchedEmail: email };
  }

  const alias = await db.userEmailAlias.findUnique({
    where: { email },
    select: {
      email: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      }
    }
  });
  if (!alias) return null;

  return {
    user: alias.user,
    matchedEmail: alias.email
  };
}

async function requestPasswordLink(input: RequestPasswordLinkInput): Promise<{ resetUrl?: string }> {
  const email = normalizeEmail(input.email);
  const resolved = await findUserByAnyEmail(email);
  const user = resolved?.user;

  if (!user) {
    return {};
  }

  const ttlMinutes = getPasswordLinkTtlMinutes(input.purpose);
  const token = await createPasswordLinkToken(email, ttlMinutes);
  const baseUrl = getPublicBaseUrl(input.origin);
  const resetUrl = `${baseUrl}/?resetToken=${token}&email=${encodeURIComponent(email)}&mode=${input.purpose}`;

  const emailClient = new EmailClient();
  const emailPayload = buildPasswordLinkEmail({
    baseUrl,
    purpose: input.purpose,
    resetUrl,
    ttlMinutes,
    firstName: input.firstName ?? user.firstName ?? undefined,
    lastName: input.lastName ?? user.lastName ?? undefined,
    invitedBy: input.invitedBy
  });

  await emailClient.send({
    to: email,
    subject: emailPayload.subject,
    html: emailPayload.html
  });

  if (env.NODE_ENV !== "production") {
    return { resetUrl };
  }

  return {};
}

export async function requestFlacsoRegistration(
  input: RequestRegistrationInput
): Promise<{ verificationUrl?: string }> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const firstName = input.firstName?.trim() || undefined;
  const lastName = input.lastName?.trim() || undefined;

  if (password.length < 8) {
    throw new Error("La contrasena debe tener al menos 8 caracteres.");
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.emailVerified) {
    throw new Error("Ese correo ya esta registrado.");
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
  const emailPayload = buildRegistrationVerificationEmail({
    baseUrl,
    verificationUrl,
    firstName,
    lastName
  });

  await emailClient.send({
    to: email,
    subject: emailPayload.subject,
    html: emailPayload.html
  });

  if (env.NODE_ENV !== "production") {
    return { verificationUrl };
  }

  return {};
}

export async function verifyFlacsoRegistration(emailRaw: string, token: string): Promise<void> {
  const email = normalizeEmail(emailRaw);

  const pending = await db.appSetting.findUnique({ where: { key: getPendingKey(email) } });
  if (!pending?.value || typeof pending.value !== "object") {
    throw new Error("Registro pendiente no encontrado o vencido.");
  }

  const parsed = pendingRegistrationSchema.safeParse(pending.value);
  if (!parsed.success) {
    throw new Error("Registro pendiente invalido.");
  }

  if (parsed.data.token !== token) {
    throw new Error("Token de verificacion invalido.");
  }

  const expiresAt = new Date(parsed.data.expiresAt);
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt.getTime() < Date.now()) {
    throw new Error("El token de verificacion esta vencido.");
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

  const payload = buildAccountConfirmedEmail({
    baseUrl: getPublicBaseUrl(),
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName
  });

  try {
    const emailClient = new EmailClient();
    await emailClient.send({
      to: email,
      subject: payload.subject,
      html: payload.html
    });
  } catch (error) {
    logger.error("No se pudo enviar el correo de cuenta confirmada tras verificacion.", {
      email,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function requestPasswordRecovery(emailRaw: string, origin?: string): Promise<{ resetUrl?: string }> {
  return requestPasswordLink({
    email: emailRaw,
    origin,
    purpose: "recovery"
  });
}

export async function requestUserActivationLink(
  input: RequestUserActivationInput
): Promise<{ activationUrl?: string }> {
  const result = await requestPasswordLink({
    email: input.email,
    origin: input.origin,
    purpose: "activation",
    firstName: input.firstName,
    lastName: input.lastName,
    invitedBy: input.invitedBy
  });

  if (env.NODE_ENV !== "production") {
    return { activationUrl: result.resetUrl };
  }

  return {};
}

export async function confirmPasswordRecovery(
  emailRaw: string,
  token: string,
  newPassword: string,
  mode: ConfirmPasswordMode = "recovery",
  origin?: string
): Promise<void> {
  const email = normalizeEmail(emailRaw);

  if (newPassword.length < 8) {
    throw new Error("La nueva contrasena debe tener al menos 8 caracteres.");
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
    throw new Error("Token invalido o inexistente.");
  }

  if (recovery.expires.getTime() < Date.now()) {
    await db.verificationToken.deleteMany({ where: { identifier: email } });
    if (mode === "activation") {
      throw new Error("El enlace de activacion esta vencido. Solicita a un administrador uno nuevo.");
    }
    throw new Error("El token de recuperacion esta vencido.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const resolved = await findUserByAnyEmail(email);
  if (!resolved) {
    throw new Error("No existe una cuenta asociada a ese correo.");
  }

  const updatedUser = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: resolved.user.id },
      data: {
        passwordHash,
        emailVerified: new Date()
      },
      select: {
        email: true,
        firstName: true,
        lastName: true
      }
    });

    await tx.verificationToken.deleteMany({ where: { identifier: email } });
    return user;
  });

  if (mode === "activation") {
    const baseUrl = getPublicBaseUrl(origin);
    const payload = buildAccountConfirmedEmail({
      baseUrl,
      firstName: updatedUser.firstName ?? undefined,
      lastName: updatedUser.lastName ?? undefined
    });

    try {
      const emailClient = new EmailClient();
      await emailClient.send({
        to: updatedUser.email,
        subject: payload.subject,
        html: payload.html
      });
    } catch (error) {
      logger.error("No se pudo enviar el correo de cuenta confirmada.", {
        email: updatedUser.email,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
