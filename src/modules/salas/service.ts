import {
  CuentaZoom,
  EstadoEjecucionEvento,
  EstadoCoberturaSoporte,
  EstadoEventoZoom,
  EstadoInteresAsistente,
  EstadoSolicitudSala,
  EstadoTarifa,
  MeetingIdEstrategia,
  ModalidadReunion,
  Prisma,
  TipoAsignacionAsistente,
  TipoEventoZoom,
  TipoInstancias,
  TipoNotificacion,
  UserRole
} from "@prisma/client";
import { db } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { EmailClient } from "@/src/lib/email.client";
import { logger } from "@/src/lib/logger";
import { notifyAdminTelegramMovement } from "@/src/lib/telegram.client";
import { ZoomApiError, ZoomMeetingsClient } from "@/src/lib/zoom-meetings.client";
import type { SessionUser } from "@/src/lib/api-auth";

type InstanceDetailInput = {
  inicioProgramadoAt: string;
};

type InstancePlan = {
  inicio: Date;
  fin: Date;
};

type ZoomRecurrencePayload = {
  type: 1 | 2 | 3;
  repeat_interval: number;
  weekly_days?: string;
  monthly_day?: number;
  monthly_week?: -1 | 1 | 2 | 3 | 4;
  monthly_week_day?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  end_times?: number;
  end_date_time?: string;
};

type ZoomOccurrenceSnapshot = {
  eventId?: string | null;
  occurrenceId: string | null;
  startTime: string;
  endTime?: string;
  durationMinutes: number;
  estadoEvento?: string | null;
  status: string | null;
  joinUrl: string | null;
  requiereAsistencia?: boolean | null;
  monitorNombre?: string | null;
  monitorEmail?: string | null;
};

type ZoomMeetingSnapshot = {
  meetingId: string;
  joinUrl: string | null;
  startUrl: string | null;
  timezone: string | null;
  hostEmail: string | null;
  instances: ZoomOccurrenceSnapshot[];
  rawPayload: Prisma.InputJsonValue | undefined;
};

type ProvisionedEventPlan = {
  inicio: Date;
  fin: Date;
  joinUrl: string | null;
  zoomMeetingId: string | null;
  zoomStartUrl: string | null;
  zoomPayloadUltimo: Prisma.InputJsonValue | undefined;
};

export type CreateSolicitudInput = {
  titulo: string;
  responsableNombre?: string;
  programaNombre?: string;
  descripcion?: string;
  finalidadAcademica?: string;
  modalidadReunion: ModalidadReunion;
  tipoInstancias: TipoInstancias;
  meetingIdEstrategia?: MeetingIdEstrategia;
  fechaInicioSolicitada: string;
  fechaFinSolicitada: string;
  timezone?: string;
  capacidadEstimada?: number;
  controlAsistencia?: boolean;
  docentesCorreos?: string;
  grabacionPreferencia?: "SI" | "NO" | "A_DEFINIR";
  requiereGrabacion?: boolean;
  requiereAsistencia?: boolean;
  motivoAsistencia?: string;
  regimenEncuentros?: string;
  fechaFinRecurrencia?: string;
  patronRecurrencia?: Record<string, unknown>;
  fechasInstancias?: string[];
  instanciasDetalle?: InstanceDetailInput[];
};

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDate(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} inválida.`);
  }
  return d;
}

function getUserDisplayName(user: {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  return (
    user.name ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.email
  );
}

function toMonthKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

function normalizeZoomMeetingId(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

function extractZoomMeetingIdFromJoinUrl(joinUrl?: string | null): string | null {
  if (!joinUrl) return null;
  try {
    const url = new URL(joinUrl);
    const host = url.hostname.toLowerCase();
    if (!host.includes("zoom.us")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const roomTypeIndex = parts.findIndex((part) => part === "j" || part === "w");
    if (roomTypeIndex < 0 || !parts[roomTypeIndex + 1]) return null;
    return normalizeZoomMeetingId(parts[roomTypeIndex + 1]);
  } catch {
    return null;
  }
}

function buildZoomJoinUrlFromMeetingId(meetingId: string): string {
  return `https://zoom.us/j/${meetingId}`;
}

function calculateEstimatedCost(minutes: number, rate: number): Prisma.Decimal {
  return new Prisma.Decimal((minutes / 60) * rate);
}

const EMAIL_LINE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SNAPSHOT_FALLBACK_MATCH_MAX_OFFSET_MS = 8 * 60 * 60 * 1000;

function resolveFallbackMinuteMatch(
  snapshotStart: Date,
  fallbackByMinute: Map<number, ZoomOccurrenceSnapshot>,
  consumedFallbackMinuteKeys: Set<number>,
  allowApproximateMatch: boolean
): { minuteKey: number; matchedFallback?: ZoomOccurrenceSnapshot } {
  const exactMinuteKey = Math.floor(snapshotStart.getTime() / 60_000);
  const exactFallback = fallbackByMinute.get(exactMinuteKey);
  if (exactFallback) {
    return { minuteKey: exactMinuteKey, matchedFallback: exactFallback };
  }

  if (!allowApproximateMatch) {
    return { minuteKey: exactMinuteKey };
  }

  let bestMinuteKey: number | null = null;
  let bestFallback: ZoomOccurrenceSnapshot | undefined;
  let bestDiffMs = Number.POSITIVE_INFINITY;

  for (const [candidateMinuteKey, candidateFallback] of fallbackByMinute.entries()) {
    if (consumedFallbackMinuteKeys.has(candidateMinuteKey)) continue;
    const candidateStart = new Date(candidateFallback.startTime);
    if (Number.isNaN(candidateStart.getTime())) continue;

    const diffMs = Math.abs(snapshotStart.getTime() - candidateStart.getTime());
    if (diffMs > SNAPSHOT_FALLBACK_MATCH_MAX_OFFSET_MS) continue;
    if (diffMs < bestDiffMs) {
      bestDiffMs = diffMs;
      bestMinuteKey = candidateMinuteKey;
      bestFallback = candidateFallback;
    }
  }

  if (bestMinuteKey === null) {
    return { minuteKey: exactMinuteKey };
  }

  return { minuteKey: bestMinuteKey, matchedFallback: bestFallback };
}

function parseDocentesEmailsByLine(raw?: string | null): string[] {
  if (!raw) return [];
  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const unique = new Map<string, string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.includes(";") || line.includes(",")) {
      throw new Error(`Correos de docentes: usa un correo por linea (error en linea ${index + 1}).`);
    }
    if (!EMAIL_LINE_REGEX.test(line)) {
      throw new Error(`Correos de docentes: email invalido en linea ${index + 1}.`);
    }
    const key = line.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, key);
    }
  }

  return Array.from(unique.values());
}

function normalizeDocentesCorreosForStorage(raw?: string | null): string | undefined {
  const parsed = parseDocentesEmailsByLine(raw);
  return parsed.length > 0 ? parsed.join("\n") : undefined;
}

async function resolveResponsibleNotificationEmail(
  responsableNombre?: string | null
): Promise<string | null> {
  const normalized = (responsableNombre ?? "").trim();
  if (!normalized) return null;

  if (EMAIL_LINE_REGEX.test(normalized)) {
    return normalized.toLowerCase();
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  const matches = await db.user.findMany({
    where: {
      emailVerified: { not: null },
      OR: [
        { name: { equals: normalized, mode: "insensitive" } },
        ...(firstName && lastName
          ? [
              {
              firstName: { equals: firstName, mode: Prisma.QueryMode.insensitive },
              lastName: { equals: lastName, mode: Prisma.QueryMode.insensitive }
              }
            ]
          : []),
        { email: { equals: normalized, mode: "insensitive" } }
      ]
    },
    select: { email: true },
    take: 1
  });

  const email = matches[0]?.email?.trim().toLowerCase();
  return email && EMAIL_LINE_REGEX.test(email) ? email : null;
}

function formatZoomDateTimeInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string => (
    parts.find((part) => part.type === type)?.value ?? ""
  );

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function normalizeRecurrenceForTimezone(
  recurrence: ZoomRecurrencePayload | undefined,
  timezone: string
): ZoomRecurrencePayload | undefined {
  if (!recurrence) return recurrence;
  if (!recurrence.end_date_time) return recurrence;

  const parsed = new Date(recurrence.end_date_time);
  if (Number.isNaN(parsed.getTime())) return recurrence;

  return {
    ...recurrence,
    end_date_time: formatZoomDateTimeInTimezone(parsed, timezone)
  };
}

function formatDateTimeForEmail(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("es-UY", {
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function extractMeetingPasswordFromJoinUrl(joinUrl?: string | null): string | null {
  if (!joinUrl) return null;

  try {
    const parsed = new URL(joinUrl);
    const raw = parsed.searchParams.get("pwd");
    if (!raw) return null;
    const normalized = raw.trim();
    return normalized || null;
  } catch {
    const match = joinUrl.match(/[?&]pwd=([^&]+)/i);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

function extractMeetingPasswordFromZoomPayload(rawPayload?: Prisma.InputJsonValue): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;

  const source = rawPayload as Record<string, unknown>;
  const candidates = [source.password, source.passcode, source.h323_password];
  for (const value of candidates) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) return normalized;
    }
  }

  return null;
}

async function getAccountPasswordFromWebhook(hostAccount?: string | null): Promise<string | null> {
  const account = (hostAccount ?? "").trim();
  const webhookUrl = env.PASSWORD_WEBHOOK_URL;
  if (!account || !webhookUrl) return null;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta: account })
    });

    const raw = await response.text();
    let data: Record<string, unknown> = {};
    if (raw) {
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        data = {};
      }
    }

    const success = data.success === true;
    const passwordValue =
      typeof data.contrasena === "string"
        ? data.contrasena
        : typeof data.password === "string"
          ? data.password
          : null;

    if (response.ok && success && passwordValue) {
      const normalized = passwordValue.trim();
      return normalized || null;
    }

    return null;
  } catch (error) {
    logger.warn("No se pudo obtener contrasena desde webhook de cuentas Zoom.", {
      hostAccount: account,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function resolveMeetingPassword(input: {
  hostAccount?: string | null;
  joinUrl?: string | null;
  rawPayload?: Prisma.InputJsonValue;
}): Promise<string | null> {
  const webhookPassword = await getAccountPasswordFromWebhook(input.hostAccount);
  if (webhookPassword) return webhookPassword;

  const payloadPassword = extractMeetingPasswordFromZoomPayload(input.rawPayload);
  if (payloadPassword) return payloadPassword;

  return extractMeetingPasswordFromJoinUrl(input.joinUrl);
}

function buildProvisionedSolicitudEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  modalidad: ModalidadReunion;
  meetingId: string | null;
  joinUrl: string | null;
  meetingPassword: string | null;
  hostAccount: string | null;
  timezone: string;
  instanceStarts: Date[];
}): string {
  const {
    solicitudId,
    titulo,
    modalidad,
    meetingId,
    joinUrl,
    meetingPassword,
    hostAccount,
    timezone,
    instanceStarts
  } = input;

  const previewCount = Math.min(instanceStarts.length, 30);
  const previewRows = instanceStarts
    .slice(0, previewCount)
    .map((date, index) => `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(date, timezone))}</li>`)
    .join("");
  const extraCount = instanceStarts.length - previewCount;
  const meetingLabel = escapeHtml(meetingId ?? "-");
  const passwordLabel = escapeHtml(meetingPassword ?? "No disponible");
  const hostLabel = escapeHtml(hostAccount ?? "-");
  const modalidadLabel = escapeHtml(modalidad);
  const titleLabel = escapeHtml(titulo);
  const solicitudLabel = escapeHtml(solicitudId);
  const hasManyInstances = instanceStarts.length > 1;

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 720px;">
      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px;">Herramienta de coordinacion Zoom - FLACSO Uruguay</p>
      <h2 style="margin: 0 0 6px;">Tu reunion esta lista</h2>
      <p style="margin: 0 0 16px; color: #334155;">
        ${hasManyInstances ? "Tu serie fue confirmada y ya esta disponible en Zoom." : "Tu reunion fue confirmada y ya esta disponible en Zoom."}
      </p>

      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin: 0 0 14px;">
        <p style="margin: 0 0 8px;"><strong>${titleLabel}</strong></p>
        <p style="margin: 0 0 4px;"><strong>Solicitud:</strong> ${solicitudLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
        <p style="margin: 0 0 4px;"><strong>ID de reunion:</strong> ${meetingLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Contrasena de la reunion:</strong> ${passwordLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Cuenta anfitriona:</strong> ${hostLabel}</p>
        <p style="margin: 0;"><strong>Instancias:</strong> ${instanceStarts.length}</p>
      </div>

      ${
        joinUrl
          ? `<p style="margin: 0 0 16px;"><a href="${escapeHtml(joinUrl)}" target="_blank" rel="noreferrer" style="display: inline-block; padding: 10px 14px; border-radius: 8px; background: #1f4b8f; color: #ffffff; text-decoration: none; font-weight: 700;">Abrir reunion en Zoom</a></p>`
          : ""
      }

      <p style="margin: 0 0 8px;"><strong>Fechas programadas</strong></p>
      <ol style="margin: 0 0 12px; padding-left: 20px;">
        ${previewRows}
      </ol>
      ${
        extraCount > 0
          ? `<p style="margin: 0 0 12px; color: #475569;">... y ${extraCount} instancia(s) mas.</p>`
          : ""
      }
      <p style="margin: 16px 0 0; color: #64748b; font-size: 12px;">
        Si necesitas cambios, responde a este correo o contacta al equipo de coordinacion.
      </p>
      <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">
        Este es un correo automatico de la herramienta de coordinacion de salas Zoom de FLACSO Uruguay.
      </p>
    </div>
  `;
}

async function sendProvisionedSolicitudEmail(input: {
  to: string;
  cc: string[];
  solicitudId: string;
  titulo: string;
  modalidad: ModalidadReunion;
  meetingId: string | null;
  joinUrl: string | null;
  hostAccount: string | null;
  rawPayload?: Prisma.InputJsonValue;
  timezone: string;
  instanceStarts: Date[];
}): Promise<void> {
  const to = input.to.trim().toLowerCase();
  if (!to || !EMAIL_LINE_REGEX.test(to)) return;

  // Buscar todos los administradores activos y agregar sus correos a la copia
  const adminUsers = await db.user.findMany({
    where: {
      role: "ADMINISTRADOR",
      emailVerified: { not: null },
      email: { not: "" }
    },
    select: { email: true }
  });
  const adminEmails = adminUsers
    .map((u) => (u.email ?? "").trim().toLowerCase())
    .filter((email) => EMAIL_LINE_REGEX.test(email) && email !== to);

  const ccUnique = Array.from(
    new Set([
      ...input.cc.map((email) => email.trim().toLowerCase()),
      ...adminEmails
    ].filter((email) => EMAIL_LINE_REGEX.test(email) && email !== to))
  );

  const client = new EmailClient();
  const subject = `${input.titulo} - Tu reunion esta lista`;
  const meetingPassword = await resolveMeetingPassword({
    hostAccount: input.hostAccount,
    joinUrl: input.joinUrl,
    rawPayload: input.rawPayload
  });
  const html = buildProvisionedSolicitudEmailHtml({
    solicitudId: input.solicitudId,
    titulo: input.titulo,
    modalidad: input.modalidad,
    meetingId: input.meetingId,
    joinUrl: input.joinUrl,
    meetingPassword,
    hostAccount: input.hostAccount,
    timezone: input.timezone,
    instanceStarts: input.instanceStarts
  });

  await client.send({
    to,
    cc: ccUnique.length > 0 ? ccUnique : undefined,
    subject,
    html
  });
}

function buildMonitoringRequiredEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  modalidad: ModalidadReunion;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  timezone: string;
  instanceStarts: Date[];
  estadoSolicitud: EstadoSolicitudSala;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const solicitudLabel = escapeHtml(input.solicitudId);
  const modalidadLabel = escapeHtml(input.modalidad);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const responsableLabel = escapeHtml(input.responsableNombre?.trim() || "-");
  const statusLabel = escapeHtml(input.estadoSolicitud);
  const previewCount = Math.min(input.instanceStarts.length, 20);
  const previewRows = input.instanceStarts
    .slice(0, previewCount)
    .map((date, index) => `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(date, input.timezone))}</li>`)
    .join("");
  const extraCount = input.instanceStarts.length - previewCount;

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 720px;">
      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px;">Herramienta de coordinacion Zoom - FLACSO Uruguay</p>
      <h2 style="margin: 0 0 6px;">Nueva solicitud con monitoreo requerido</h2>
      <p style="margin: 0 0 16px; color: #334155;">
        Se registro una nueva solicitud que requiere asistencia Zoom.
      </p>

      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin: 0 0 14px;">
        <p style="margin: 0 0 8px;"><strong>${titleLabel}</strong></p>
        <p style="margin: 0 0 4px;"><strong>Solicitud:</strong> ${solicitudLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Programa:</strong> ${programaLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Responsable:</strong> ${responsableLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Estado:</strong> ${statusLabel}</p>
        <p style="margin: 0;"><strong>Instancias:</strong> ${input.instanceStarts.length}</p>
      </div>

      <p style="margin: 0 0 8px;"><strong>Fechas previstas</strong></p>
      <ol style="margin: 0 0 12px; padding-left: 20px;">
        ${previewRows}
      </ol>
      ${
        extraCount > 0
          ? `<p style="margin: 0 0 12px; color: #475569;">... y ${extraCount} instancia(s) mas.</p>`
          : ""
      }
      <p style="margin: 16px 0 0; color: #64748b; font-size: 12px;">
        Revisa la agenda libre para marcar interes en las instancias disponibles.
      </p>
    </div>
  `;
}

async function listAdminNotificationEmails(): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      emailVerified: { not: null },
      role: UserRole.ADMINISTRADOR,
      email: { not: "" }
    },
    select: { email: true }
  });

  const unique = new Set<string>();
  for (const user of users) {
    const normalized = (user.email ?? "").trim().toLowerCase();
    if (!EMAIL_LINE_REGEX.test(normalized)) continue;
    unique.add(normalized);
  }

  return Array.from(unique);
}

async function sendBroadcastEmail(input: {
  recipients: string[];
  subject: string;
  html: string;
}): Promise<void> {
  const uniqueRecipients = Array.from(
    new Set(
      input.recipients
        .map((email) => email.trim().toLowerCase())
        .filter((email) => EMAIL_LINE_REGEX.test(email))
    )
  );
  if (uniqueRecipients.length === 0) return;

  const defaultTo = (env.SMTP_FROM ?? "").trim().toLowerCase();
  const to = EMAIL_LINE_REGEX.test(defaultTo) ? defaultTo : uniqueRecipients[0];
  const bcc = uniqueRecipients.filter((email) => email !== to);
  const client = new EmailClient();

  await client.send({
    to,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject: input.subject,
    html: input.html
  });
}

async function listAssistantPoolEmails(): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      emailVerified: { not: null },
      role: { in: [UserRole.ASISTENTE_ZOOM, UserRole.SOPORTE_ZOOM] },
      email: { not: "" }
    },
    select: { email: true }
  });

  const unique = new Set<string>();
  for (const user of users) {
    const normalized = (user.email ?? "").trim().toLowerCase();
    if (!EMAIL_LINE_REGEX.test(normalized)) continue;
    unique.add(normalized);
  }

  return Array.from(unique);
}

async function sendMonitoringRequiredEmailToAssistantPool(input: {
  solicitudId: string;
  titulo: string;
  modalidad: ModalidadReunion;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  timezone: string;
  instanceStarts: Date[];
  estadoSolicitud: EstadoSolicitudSala;
}): Promise<void> {
  const recipients = await listAssistantPoolEmails();
  if (recipients.length === 0) return;

  const subject = `Nueva solicitud con monitoreo: ${input.titulo}`;
  const html = buildMonitoringRequiredEmailHtml(input);
  await sendBroadcastEmail({
    recipients,
    subject,
    html
  });
}

function buildDocenteSolicitudCreatedAdminEmailHtml(input: {
  actorNombre: string;
  actorEmail: string;
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  modalidad: ModalidadReunion;
  estadoSolicitud: EstadoSolicitudSala;
  timezone: string;
  instanceStarts: Date[];
}): string {
  const actorNombreLabel = escapeHtml(input.actorNombre);
  const actorEmailLabel = escapeHtml(input.actorEmail);
  const solicitudLabel = escapeHtml(input.solicitudId);
  const tituloLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const modalidadLabel = escapeHtml(input.modalidad);
  const estadoLabel = escapeHtml(input.estadoSolicitud);
  const previewCount = Math.min(input.instanceStarts.length, 20);
  const previewRows = input.instanceStarts
    .slice(0, previewCount)
    .map((date, index) => `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(date, input.timezone))}</li>`)
    .join("");
  const extraCount = input.instanceStarts.length - previewCount;

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 720px;">
      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px;">Herramienta de coordinacion Zoom - FLACSO Uruguay</p>
      <h2 style="margin: 0 0 6px;">Nueva solicitud creada por docente</h2>
      <p style="margin: 0 0 16px; color: #334155;">
        Se registro una nueva solicitud en el sistema.
      </p>

      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin: 0 0 14px;">
        <p style="margin: 0 0 8px;"><strong>${tituloLabel}</strong></p>
        <p style="margin: 0 0 4px;"><strong>Solicitud:</strong> ${solicitudLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Creada por:</strong> ${actorNombreLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Email creador:</strong> ${actorEmailLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Programa:</strong> ${programaLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Estado:</strong> ${estadoLabel}</p>
        <p style="margin: 0;"><strong>Instancias:</strong> ${input.instanceStarts.length}</p>
      </div>

      <p style="margin: 0 0 8px;"><strong>Fechas previstas</strong></p>
      <ol style="margin: 0 0 12px; padding-left: 20px;">
        ${previewRows}
      </ol>
      ${
        extraCount > 0
          ? `<p style="margin: 0 0 12px; color: #475569;">... y ${extraCount} instancia(s) mas.</p>`
          : ""
      }
    </div>
  `;
}

async function sendDocenteSolicitudCreatedEmailToAdmins(input: {
  actorNombre: string;
  actorEmail: string;
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  modalidad: ModalidadReunion;
  estadoSolicitud: EstadoSolicitudSala;
  timezone: string;
  instanceStarts: Date[];
}): Promise<void> {
  const recipients = await listAdminNotificationEmails();
  if (recipients.length === 0) return;

  const subject = `Solicitud creada por docente: ${input.titulo}`;
  const html = buildDocenteSolicitudCreatedAdminEmailHtml(input);
  await sendBroadcastEmail({
    recipients,
    subject,
    html
  });
}

function buildAssistantPreferenceAdminEmailHtml(input: {
  asistenteNombre: string;
  asistenteEmail: string;
  estadoInteres: EstadoInteresAsistente;
  comentario?: string;
  solicitudId: string;
  eventoId: string;
  titulo: string;
  programaNombre?: string | null;
  inicio: Date;
  fin: Date;
  timezone: string;
}): string {
  const asistenteNombreLabel = escapeHtml(input.asistenteNombre);
  const asistenteEmailLabel = escapeHtml(input.asistenteEmail);
  const estadoLabel = escapeHtml(input.estadoInteres);
  const solicitudLabel = escapeHtml(input.solicitudId);
  const eventoLabel = escapeHtml(input.eventoId);
  const tituloLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const inicioLabel = escapeHtml(formatDateTimeForEmail(input.inicio, input.timezone));
  const finLabel = escapeHtml(formatDateTimeForEmail(input.fin, input.timezone));
  const comentarioLabel = escapeHtml((input.comentario ?? "").trim() || "Sin comentario");

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 720px;">
      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px;">Herramienta de coordinacion Zoom - FLACSO Uruguay</p>
      <h2 style="margin: 0 0 6px;">Preferencia de asistencia actualizada</h2>
      <p style="margin: 0 0 16px; color: #334155;">
        Un asistente Zoom registro su preferencia para una instancia.
      </p>

      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin: 0 0 14px;">
        <p style="margin: 0 0 8px;"><strong>${tituloLabel}</strong></p>
        <p style="margin: 0 0 4px;"><strong>Solicitud:</strong> ${solicitudLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Evento:</strong> ${eventoLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Programa:</strong> ${programaLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Asistente:</strong> ${asistenteNombreLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Email asistente:</strong> ${asistenteEmailLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Preferencia:</strong> ${estadoLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Inicio:</strong> ${inicioLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Fin:</strong> ${finLabel}</p>
        <p style="margin: 0;"><strong>Comentario:</strong> ${comentarioLabel}</p>
      </div>
    </div>
  `;
}

async function sendAssistantPreferenceEmailToAdmins(input: {
  asistenteNombre: string;
  asistenteEmail: string;
  estadoInteres: EstadoInteresAsistente;
  comentario?: string;
  solicitudId: string;
  eventoId: string;
  titulo: string;
  programaNombre?: string | null;
  inicio: Date;
  fin: Date;
  timezone: string;
}): Promise<void> {
  const recipients = await listAdminNotificationEmails();
  if (recipients.length === 0) return;

  const subject = `Preferencia de asistencia: ${input.titulo}`;
  const html = buildAssistantPreferenceAdminEmailHtml(input);
  await sendBroadcastEmail({
    recipients,
    subject,
    html
  });
}

function buildAssignmentNotificationHtml(input: {
  solicitudId: string;
  eventoId: string;
  titulo: string;
  programaNombre?: string | null;
  modalidad: ModalidadReunion;
  inicio: Date;
  fin: Date;
  timezone: string;
  joinUrl?: string | null;
  asistenteNombre: string;
  asistenteEmail: string;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const solicitudLabel = escapeHtml(input.solicitudId);
  const eventoLabel = escapeHtml(input.eventoId);
  const modalidadLabel = escapeHtml(input.modalidad);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const asistenteNombreLabel = escapeHtml(input.asistenteNombre);
  const asistenteEmailLabel = escapeHtml(input.asistenteEmail);
  const inicioLabel = escapeHtml(formatDateTimeForEmail(input.inicio, input.timezone));
  const finLabel = escapeHtml(formatDateTimeForEmail(input.fin, input.timezone));

  return `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5; max-width: 720px;">
      <p style="margin: 0 0 12px; color: #64748b; font-size: 12px;">Herramienta de coordinacion Zoom - FLACSO Uruguay</p>
      <h2 style="margin: 0 0 6px;">Asignacion de monitoreo confirmada</h2>
      <p style="margin: 0 0 16px; color: #334155;">
        Se confirmo la persona de asistencia para esta instancia.
      </p>

      <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; background: #f8fafc; margin: 0 0 14px;">
        <p style="margin: 0 0 8px;"><strong>${titleLabel}</strong></p>
        <p style="margin: 0 0 4px;"><strong>Solicitud:</strong> ${solicitudLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Evento:</strong> ${eventoLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Programa:</strong> ${programaLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Inicio:</strong> ${inicioLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Fin:</strong> ${finLabel}</p>
        <p style="margin: 0 0 4px;"><strong>Asistente asignado:</strong> ${asistenteNombreLabel}</p>
        <p style="margin: 0;"><strong>Email asistente:</strong> ${asistenteEmailLabel}</p>
      </div>

      ${
        input.joinUrl
          ? `<p style="margin: 0 0 16px;"><a href="${escapeHtml(input.joinUrl)}" target="_blank" rel="noreferrer" style="display: inline-block; padding: 10px 14px; border-radius: 8px; background: #1f4b8f; color: #ffffff; text-decoration: none; font-weight: 700;">Abrir reunion en Zoom</a></p>`
          : ""
      }

      <p style="margin: 16px 0 0; color: #64748b; font-size: 12px;">
        Este es un correo automatico de la herramienta de coordinacion de salas Zoom de FLACSO Uruguay.
      </p>
    </div>
  `;
}

async function sendDefinitiveAssignmentEmails(input: {
  solicitudId: string;
  eventoId: string;
  titulo: string;
  programaNombre?: string | null;
  modalidad: ModalidadReunion;
  inicio: Date;
  fin: Date;
  timezone: string;
  joinUrl?: string | null;
  asistenteNombre: string;
  asistenteEmail: string;
  responsableEmail: string | null;
}): Promise<void> {
  const recipients = new Set<string>();
  const assistantEmail = input.asistenteEmail.trim().toLowerCase();
  if (EMAIL_LINE_REGEX.test(assistantEmail)) {
    recipients.add(assistantEmail);
  }

  const responsableEmail = (input.responsableEmail ?? "").trim().toLowerCase();
  if (EMAIL_LINE_REGEX.test(responsableEmail)) {
    recipients.add(responsableEmail);
  }

  if (recipients.size === 0) return;

  const client = new EmailClient();
  const subject = `Asignacion confirmada: ${input.titulo}`;
  const html = buildAssignmentNotificationHtml(input);

  await Promise.all(
    Array.from(recipients).map((to) =>
      client.send({
        to,
        subject,
        html
      })
    )
  );
}

function parseZoomMeetingSnapshot(data: Record<string, unknown>): ZoomMeetingSnapshot {
  const rawId = data.id;
  const meetingId = normalizeZoomMeetingId(rawId != null ? String(rawId) : null);
  if (!meetingId) {
    throw new Error("Zoom no devolvio un meeting ID valido.");
  }

  const joinUrl = typeof data.join_url === "string" ? data.join_url : null;
  const startUrl = typeof data.start_url === "string" ? data.start_url : null;
  const timezone = typeof data.timezone === "string" ? data.timezone : null;
  const hostEmail = typeof data.host_email === "string" ? data.host_email : null;
  const defaultDuration = Math.max(1, numberFromUnknown(data.duration) ?? 60);
  const occurrencesRaw = Array.isArray(data.occurrences) ? data.occurrences : [];

  const instances: ZoomOccurrenceSnapshot[] = [];
  for (const item of occurrencesRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const occurrence = item as Record<string, unknown>;
    const startTime = typeof occurrence.start_time === "string" ? occurrence.start_time : null;
    if (!startTime) continue;
    const parsedStart = new Date(startTime);
    if (Number.isNaN(parsedStart.getTime())) continue;

    const occurrenceId = occurrence.occurrence_id != null ? String(occurrence.occurrence_id) : null;
    const durationMinutes = Math.max(1, numberFromUnknown(occurrence.duration) ?? defaultDuration);
    const status = typeof occurrence.status === "string" ? occurrence.status : null;
    const endTime = new Date(parsedStart.getTime() + durationMinutes * 60_000).toISOString();
    const joinUrlForOccurrence =
      joinUrl && occurrenceId
        ? `${joinUrl}${joinUrl.includes("?") ? "&" : "?"}occurrence_id=${encodeURIComponent(occurrenceId)}`
        : joinUrl;

    instances.push({
      occurrenceId,
      startTime: parsedStart.toISOString(),
      endTime,
      durationMinutes,
      status,
      joinUrl: joinUrlForOccurrence,
      requiereAsistencia: null,
      monitorNombre: null,
      monitorEmail: null
    });
  }

  if (instances.length === 0) {
    const startTime = typeof data.start_time === "string" ? data.start_time : null;
    if (startTime) {
      const parsedStart = new Date(startTime);
      if (!Number.isNaN(parsedStart.getTime())) {
        instances.push({
          occurrenceId: null,
          startTime: parsedStart.toISOString(),
          endTime: new Date(parsedStart.getTime() + defaultDuration * 60_000).toISOString(),
          durationMinutes: defaultDuration,
          status: typeof data.status === "string" ? data.status : null,
          joinUrl,
          requiereAsistencia: null,
          monitorNombre: null,
          monitorEmail: null
        });
      }
    }
  }

  return {
    meetingId,
    joinUrl,
    startUrl,
    timezone,
    hostEmail,
    instances,
    rawPayload: data as unknown as Prisma.InputJsonValue
  };
}

async function fetchZoomMeetingSnapshot(
  zoomClient: ZoomMeetingsClient,
  meetingId: string
): Promise<ZoomMeetingSnapshot | null> {
  const data = await zoomClient.getMeeting(meetingId, { show_previous_occurrences: true });
  if (!data) return null;
  return parseZoomMeetingSnapshot(data);
}

async function resolveZoomHostEmail(
  preferredEmail: string | null | undefined,
  zoomClient: ZoomMeetingsClient
): Promise<string> {
  if (preferredEmail && !preferredEmail.endsWith("@flacso.local")) {
    return preferredEmail;
  }

  if (env.ZOOM_GROUP_ID) {
    const members = await zoomClient.listGroupMembers(env.ZOOM_GROUP_ID, 30).catch(() => []);
    const fallbackEmail = members.find((member) => typeof member.email === "string" && member.email)?.email;
    if (typeof fallbackEmail === "string") return fallbackEmail;
  }

  throw new Error("No se pudo resolver un ownerEmail valido para la cuenta Zoom.");
}

function buildZoomRecurrencePayload(input: CreateSolicitudInput): ZoomRecurrencePayload | undefined {
  if (input.tipoInstancias !== TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM) return undefined;
  const recurrence = (input.patronRecurrencia ?? {}) as Record<string, unknown>;
  const zoomRecurrenceRaw = recurrence.zoomRecurrence;
  if (!zoomRecurrenceRaw || typeof zoomRecurrenceRaw !== "object" || Array.isArray(zoomRecurrenceRaw)) {
    return undefined;
  }

  const zoomRecurrence = zoomRecurrenceRaw as Record<string, unknown>;
  const type = numberFromUnknown(zoomRecurrence.type);
  const repeatInterval = numberFromUnknown(zoomRecurrence.repeat_interval);
  if (!type || !repeatInterval) return undefined;

  const payload: ZoomRecurrencePayload = {
    type: type as 1 | 2 | 3,
    repeat_interval: repeatInterval
  };

  if (zoomRecurrence.weekly_days != null) {
    payload.weekly_days = String(zoomRecurrence.weekly_days);
  }
  const monthlyDay = numberFromUnknown(zoomRecurrence.monthly_day);
  if (monthlyDay != null) payload.monthly_day = monthlyDay;
  const monthlyWeek = numberFromUnknown(zoomRecurrence.monthly_week);
  if (monthlyWeek != null) payload.monthly_week = monthlyWeek as -1 | 1 | 2 | 3 | 4;
  const monthlyWeekDay = numberFromUnknown(zoomRecurrence.monthly_week_day);
  if (monthlyWeekDay != null) payload.monthly_week_day = monthlyWeekDay as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const endTimes = numberFromUnknown(zoomRecurrence.end_times);
  if (endTimes != null) {
    payload.end_times = endTimes;
  } else if (typeof zoomRecurrence.end_date_time === "string" && zoomRecurrence.end_date_time.trim()) {
    payload.end_date_time = zoomRecurrence.end_date_time;
  }

  return payload;
}

async function createZoomMeetingForSolicitud(params: {
  accountOwnerEmail: string;
  input: CreateSolicitudInput;
  start: Date;
  durationMinutes: number;
  timezone: string;
}): Promise<ZoomMeetingSnapshot> {
  const { accountOwnerEmail, input, start, durationMinutes, timezone } = params;

  const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
  const hostEmail = await resolveZoomHostEmail(accountOwnerEmail, zoomClient);
  const meetingType = input.tipoInstancias === TipoInstancias.UNICA ? 2 : 8;
  const recurrence = normalizeRecurrenceForTimezone(buildZoomRecurrencePayload(input), timezone);

  const payload: Record<string, unknown> = {
    topic: input.titulo,
    type: meetingType,
    start_time: formatZoomDateTimeInTimezone(start, timezone),
    duration: durationMinutes,
    timezone,
    agenda: input.descripcion ?? undefined,
    settings: {
      approval_type: 2,
      registration_type: 1,
      waiting_room: true, // SIEMPRE habilitar sala de espera
      auto_recording: input.requiereGrabacion ? "cloud" : "none"
    }
  };

  if (meetingType === 8) {
    if (!recurrence) {
      throw new Error("Falta configurar la recurrencia Zoom para crear la reunion recurrente.");
    }
    payload.recurrence = recurrence;
  }

  const createdData = await zoomClient.createMeeting(hostEmail, payload);
  const createdSnapshot = parseZoomMeetingSnapshot(createdData);
  const desiredAutoRecording = input.requiereGrabacion ? "cloud" : "none";
  const createdSettings =
    createdData.settings && typeof createdData.settings === "object" && !Array.isArray(createdData.settings)
      ? (createdData.settings as Record<string, unknown>)
      : null;
  const currentAutoRecording =
    createdSettings && typeof createdSettings.auto_recording === "string"
      ? createdSettings.auto_recording
      : null;
  const currentWaitingRoom =
    createdSettings && typeof createdSettings.waiting_room === "boolean"
      ? createdSettings.waiting_room
      : null;

  if (currentAutoRecording !== desiredAutoRecording || currentWaitingRoom !== true) {
    await zoomClient
      .updateMeeting(createdSnapshot.meetingId, {
        settings: {
          waiting_room: true, // SIEMPRE habilitar sala de espera
          auto_recording: desiredAutoRecording
        }
      })
      .catch(() => null);
  }

  // Best effort checks to keep Zoom state in sync with host views.
  await zoomClient
    .listUserMeetings(hostEmail, { type: "scheduled", page_size: 30 })
    .catch(() => null);
  await zoomClient
    .listUserUpcomingMeetings(hostEmail)
    .catch(() => null);
  await zoomClient
    .getMeetingSipDialing(createdSnapshot.meetingId)
    .catch(() => null);

  const fromMeetingRead = await fetchZoomMeetingSnapshot(zoomClient, createdSnapshot.meetingId);
  return fromMeetingRead ?? createdSnapshot;
}

function buildProvisionedEventPlans(
  zoomSnapshot: ZoomMeetingSnapshot | null,
  fallbackPlans: InstancePlan[],
  durationMinutes: number
): ProvisionedEventPlan[] {
  if (fallbackPlans.length > 0) {
    const instanceByStartMs = new Map<number, ZoomOccurrenceSnapshot>();
    for (const instance of zoomSnapshot?.instances ?? []) {
      const start = new Date(instance.startTime);
      if (!Number.isNaN(start.getTime())) {
        instanceByStartMs.set(start.getTime(), instance);
      }
    }

    return fallbackPlans.map((plan, index) => {
      const matched = instanceByStartMs.get(plan.inicio.getTime());
      const minutes = Math.max(1, matched?.durationMinutes ?? durationMinutes);
      return {
        inicio: plan.inicio,
        fin: new Date(plan.inicio.getTime() + minutes * 60_000),
        joinUrl: matched?.joinUrl ?? zoomSnapshot?.joinUrl ?? null,
        zoomMeetingId: index === 0 ? zoomSnapshot?.meetingId ?? null : null,
        zoomStartUrl: zoomSnapshot?.startUrl ?? null,
        zoomPayloadUltimo: zoomSnapshot?.rawPayload
      };
    });
  }

  if (zoomSnapshot?.instances?.length) {
    const mapped = zoomSnapshot.instances
      .map((instance, index) => {
        const start = new Date(instance.startTime);
        if (Number.isNaN(start.getTime())) return null;
        const minutes = Math.max(1, instance.durationMinutes || durationMinutes);
        return {
          inicio: start,
          fin: new Date(start.getTime() + minutes * 60_000),
          joinUrl: instance.joinUrl ?? zoomSnapshot.joinUrl,
          zoomMeetingId: index === 0 ? zoomSnapshot.meetingId : null,
          zoomStartUrl: zoomSnapshot.startUrl ?? null,
          zoomPayloadUltimo: zoomSnapshot.rawPayload
        };
      })
      .filter((item): item is ProvisionedEventPlan => Boolean(item));

    if (mapped.length > 0) {
      return mapped;
    }
  }

  return [];
}

function buildProvisionedEventPlansFromIndependentMeetings(
  snapshots: ZoomMeetingSnapshot[],
  fallbackPlans: InstancePlan[],
  durationMinutes: number
): ProvisionedEventPlan[] {
  if (snapshots.length === 0 || fallbackPlans.length === 0) return [];

  const sortedFallbackPlans = [...fallbackPlans].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    const aStart = new Date(a.instances[0]?.startTime ?? "").getTime();
    const bStart = new Date(b.instances[0]?.startTime ?? "").getTime();
    if (Number.isNaN(aStart) && Number.isNaN(bStart)) return 0;
    if (Number.isNaN(aStart)) return 1;
    if (Number.isNaN(bStart)) return -1;
    return aStart - bStart;
  });

  const total = Math.min(sortedSnapshots.length, sortedFallbackPlans.length);
  const plans: ProvisionedEventPlan[] = [];

  for (let index = 0; index < total; index += 1) {
    const snapshot = sortedSnapshots[index];
    const fallback = sortedFallbackPlans[index];
    const instance = snapshot?.instances[0];
    const start = instance?.startTime ? new Date(instance.startTime) : fallback.inicio;
    const hasValidStart = start instanceof Date && !Number.isNaN(start.getTime());
    const resolvedStart = hasValidStart ? start : fallback.inicio;
    const minutes = Math.max(1, instance?.durationMinutes ?? durationMinutes);

    plans.push({
      inicio: resolvedStart,
      fin: new Date(resolvedStart.getTime() + minutes * 60_000),
      joinUrl: instance?.joinUrl ?? snapshot?.joinUrl ?? null,
      zoomMeetingId: snapshot?.meetingId ?? null,
      zoomStartUrl: snapshot?.startUrl ?? null,
      zoomPayloadUltimo: snapshot?.rawPayload
    });
  }

  return plans;
}

async function getOrCreateDocente(user: SessionUser) {
  const existing = await db.docente.findUnique({ where: { usuarioId: user.id } });
  if (existing) return existing;
  return db.docente.create({ data: { usuarioId: user.id } });
}

async function getOrCreateAsistente(user: SessionUser) {
  const existing = await db.asistenteZoom.findUnique({ where: { usuarioId: user.id } });
  if (existing) return existing;
  return db.asistenteZoom.create({ data: { usuarioId: user.id } });
}

async function getActiveRate(modality: ModalidadReunion) {
  return db.tarifaAsistenciaGlobal.findFirst({
    where: {
      modalidadReunion: modality,
      estado: EstadoTarifa.ACTIVA
    },
    orderBy: { vigenteDesde: "desc" }
  });
}

async function getOrCreateCuentaZoomDefault() {
  const existing = await db.cuentaZoom.findFirst({
    where: { activa: true },
    orderBy: { prioridad: "asc" }
  });
  if (existing) return existing;

  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    return null;
  }

  return db.cuentaZoom.create({
    data: {
      nombreCuenta: "Cuenta Zoom principal",
      zoomAccountId: env.ZOOM_ACCOUNT_ID,
      ownerEmail: `zoom-${env.ZOOM_ACCOUNT_ID}@flacso.local`,
      clientId: env.ZOOM_CLIENT_ID,
      clientSecretRef: "env:ZOOM_CLIENT_SECRET",
      activa: true,
      prioridad: 100
    }
  });
}

function hasTimeOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && aEnd > bStart;
}

type BusyWindow = {
  start: Date;
  end: Date;
  meetingId?: string | null;
};

type AccountCandidateEvaluation = {
  account: CuentaZoom;
  supportsAllInstances: boolean;
  loadScore: number;
  dbFutureEventsCount: number;
  zoomFutureMeetingsCount: number;
};

function buildBusyWindowKey(window: BusyWindow): string {
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";

  const normalizedMeetingId = normalizeZoomMeetingId(window.meetingId ?? null);
  if (normalizedMeetingId) {
    return `meeting:${normalizedMeetingId}:${startMs}:${endMs}`;
  }

  return `time:${startMs}:${endMs}`;
}

function dedupeBusyWindows(windows: BusyWindow[]): BusyWindow[] {
  const byKey = new Map<string, BusyWindow>();
  for (const window of windows) {
    const key = buildBusyWindowKey(window);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, window);
    }
  }
  return Array.from(byKey.values());
}

async function listZoomBusyWindowsForOwner(
  zoomClient: ZoomMeetingsClient,
  ownerEmail: string
): Promise<BusyWindow[]> {
  const upcoming = await zoomClient.listUserMeetings(ownerEmail, {
    type: "upcoming",
    page_size: 300
  });
  const meetings = Array.isArray(upcoming.meetings)
    ? (upcoming.meetings as Array<Record<string, unknown>>)
    : [];

  const windows: BusyWindow[] = [];
  for (const meeting of meetings) {
    const startRaw = typeof meeting.start_time === "string" ? meeting.start_time : "";
    if (!startRaw) continue;
    const start = new Date(startRaw);
    if (Number.isNaN(start.getTime())) continue;

    const durationMinutes = Math.max(1, Math.floor(numberFromUnknown(meeting.duration) ?? 60));
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const meetingIdRaw = meeting.id != null ? String(meeting.id) : null;

    windows.push({
      start,
      end,
      meetingId: normalizeZoomMeetingId(meetingIdRaw)
    });
  }

  return dedupeBusyWindows(windows);
}

async function listAvailableCuentaZoomCandidatesForAllInstances(instancePlans: InstancePlan[]): Promise<CuentaZoom[]> {
  let activeAccounts = await db.cuentaZoom.findMany({
    where: { activa: true },
    orderBy: [{ prioridad: "asc" }, { createdAt: "asc" }]
  });

  if (activeAccounts.length === 0) {
    const created = await getOrCreateCuentaZoomDefault();
    if (created) {
      activeAccounts = [created];
    }
  }

  if (activeAccounts.length === 0) return [];
  if (instancePlans.length === 0) return activeAccounts;

  const windows = instancePlans.map((plan) => ({
    start: plan.inicio,
    end: plan.fin
  }));

  let zoomClient: ZoomMeetingsClient | null = null;
  try {
    zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
  } catch (error) {
    logger.warn("No se pudo inicializar cliente Zoom para validar disponibilidad por cuenta.", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const evaluations = await Promise.all(
    activeAccounts.map(async (account): Promise<AccountCandidateEvaluation> => {
      const concurrentLimit =
        account.limiteEventosConcurrentes && account.limiteEventosConcurrentes > 0
          ? account.limiteEventosConcurrentes
          : 1;

      const [dbOverlappingEvents, dbFutureEventsCount] = await Promise.all([
        db.eventoZoom.findMany({
          where: {
            cuentaZoomId: account.id,
            estadoEvento: { not: EstadoEventoZoom.CANCELADO },
            OR: windows.map((window) => ({
              inicioProgramadoAt: { lt: window.end },
              finProgramadoAt: { gt: window.start }
            }))
          },
          select: {
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            zoomMeetingId: true
          }
        }),
        db.eventoZoom.count({
          where: {
            cuentaZoomId: account.id,
            estadoEvento: { not: EstadoEventoZoom.CANCELADO },
            finProgramadoAt: { gt: new Date() }
          }
        })
      ]);

      const dbBusyWindows: BusyWindow[] = dbOverlappingEvents.map((event) => ({
        start: event.inicioProgramadoAt,
        end: event.finProgramadoAt,
        meetingId: event.zoomMeetingId
      }));

      let zoomBusyWindows: BusyWindow[] = [];
      if (zoomClient) {
        try {
          zoomBusyWindows = await listZoomBusyWindowsForOwner(zoomClient, account.ownerEmail);
        } catch (error) {
          logger.warn("No se pudo validar disponibilidad Zoom para una cuenta, se descarta como candidata.", {
            cuentaZoomId: account.id,
            ownerEmail: account.ownerEmail,
            error: error instanceof Error ? error.message : String(error)
          });
          return {
            account,
            supportsAllInstances: false,
            loadScore: Number.MAX_SAFE_INTEGER,
            dbFutureEventsCount,
            zoomFutureMeetingsCount: 0
          };
        }
      }

      const mergedBusyWindows = dedupeBusyWindows([...dbBusyWindows, ...zoomBusyWindows]);
      let supportsAllInstances = true;

      for (const window of windows) {
        let concurrentCount = 0;
        for (const existing of mergedBusyWindows) {
          if (hasTimeOverlap(window.start, window.end, existing.start, existing.end)) {
            concurrentCount += 1;
            if (concurrentCount >= concurrentLimit) {
              supportsAllInstances = false;
              break;
            }
          }
        }
        if (!supportsAllInstances) break;
      }

      const zoomFutureMeetingsCount = zoomBusyWindows.length;
      const loadScore = Math.max(dbFutureEventsCount, zoomFutureMeetingsCount);

      return {
        account,
        supportsAllInstances,
        loadScore,
        dbFutureEventsCount,
        zoomFutureMeetingsCount
      };
    })
  );

  return evaluations
    .filter((item) => item.supportsAllInstances)
    .sort((a, b) => {
      if (a.loadScore !== b.loadScore) return a.loadScore - b.loadScore;
      if (a.dbFutureEventsCount !== b.dbFutureEventsCount) {
        return a.dbFutureEventsCount - b.dbFutureEventsCount;
      }
      if (a.zoomFutureMeetingsCount !== b.zoomFutureMeetingsCount) {
        return a.zoomFutureMeetingsCount - b.zoomFutureMeetingsCount;
      }
      if (a.account.prioridad !== b.account.prioridad) {
        return a.account.prioridad - b.account.prioridad;
      }
      return a.account.ownerEmail.localeCompare(b.account.ownerEmail, "es", {
        sensitivity: "base"
      });
    })
    .map((item) => item.account);
}

function zoomSnapshotSupportsAllRequestedInstances(
  zoomSnapshot: ZoomMeetingSnapshot,
  requestedPlans: InstancePlan[]
): boolean {
  if (requestedPlans.length <= 1) return true;

  const instanceCountFromSnapshot = zoomSnapshot.instances?.length ?? 0;
  if (instanceCountFromSnapshot > 0 && instanceCountFromSnapshot < requestedPlans.length) {
    return false;
  }

  const rawPayload =
    zoomSnapshot.rawPayload && typeof zoomSnapshot.rawPayload === "object" && !Array.isArray(zoomSnapshot.rawPayload)
      ? (zoomSnapshot.rawPayload as Record<string, unknown>)
      : null;
  const recurrenceRaw =
    rawPayload?.recurrence && typeof rawPayload.recurrence === "object" && !Array.isArray(rawPayload.recurrence)
      ? (rawPayload.recurrence as Record<string, unknown>)
      : null;

  if (recurrenceRaw) {
    const endTimes = numberFromUnknown(recurrenceRaw.end_times);
    if (endTimes !== null && Number.isInteger(endTimes)) {
      if (endTimes < requestedPlans.length) {
        return false;
      }
    } else {
      const endDateText =
        typeof recurrenceRaw.end_date_time === "string" && recurrenceRaw.end_date_time.trim()
          ? recurrenceRaw.end_date_time
          : null;
      if (endDateText) {
        const endDate = new Date(endDateText);
        if (!Number.isNaN(endDate.getTime())) {
          const lastRequested = requestedPlans[requestedPlans.length - 1]?.inicio;
          if (lastRequested && endDate < lastRequested) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

function buildInstanceDates(input: CreateSolicitudInput): Date[] {
  const start = toDate(input.fechaInicioSolicitada, "fechaInicioSolicitada");

  if (input.tipoInstancias === TipoInstancias.UNICA) {
    return [start];
  }

  if (input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM) {
    const rawDates = input.fechasInstancias ?? [];
    if (rawDates.length < 2) {
      throw new Error("Para MULTIPLE_NO_COMPATIBLE_ZOOM se requieren al menos 2 fechas.");
    }
    return rawDates.map((raw) => toDate(raw, "fechasInstancias"));
  }

  const recurrence = (input.patronRecurrencia ?? {}) as {
    totalInstancias?: number;
    intervaloDias?: number;
  };
  const total = recurrence.totalInstancias ?? 4;
  const interval = recurrence.intervaloDias ?? 7;

  if (total < 2) {
    throw new Error("Para MULTIPLE_COMPATIBLE_ZOOM totalInstancias debe ser >= 2.");
  }

  const dates: Date[] = [];
  for (let i = 0; i < total; i += 1) {
    const next = new Date(start);
    next.setDate(start.getDate() + i * interval);
    dates.push(next);
  }

  return dates;
}

function buildInstancePlans(input: CreateSolicitudInput, durationMinutes: number): InstancePlan[] {
  const details = input.instanciasDetalle ?? [];

  if (details.length > 0) {
    const parsed = details.map((item, index) => {
      const inicio = toDate(item.inicioProgramadoAt, `instanciasDetalle[${index}].inicioProgramadoAt`);
      return {
        inicio,
        fin: new Date(inicio.getTime() + durationMinutes * 60000)
      };
    });

    if (input.tipoInstancias !== TipoInstancias.UNICA && parsed.length < 2) {
      throw new Error("Para reuniones múltiples se requieren al menos 2 instancias en el detalle.");
    }

    const sorted = parsed.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    const unique = new Set<number>();
    for (const plan of sorted) {
      const key = plan.inicio.getTime();
      if (unique.has(key)) {
        throw new Error("No puede haber instancias repetidas en fecha y hora.");
      }
      unique.add(key);
    }

    return sorted;
  }

  return buildInstanceDates(input).map((inicio) => ({
    inicio,
    fin: new Date(inicio.getTime() + durationMinutes * 60000)
  }));
}

function validateZoomRecurrenceRestrictions(input: CreateSolicitudInput) {
  if (input.tipoInstancias !== TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM) return;

  const recurrence = (input.patronRecurrencia ?? {}) as Record<string, unknown>;
  const zoomRecurrenceRaw = recurrence.zoomRecurrence;
  if (!zoomRecurrenceRaw || typeof zoomRecurrenceRaw !== "object" || Array.isArray(zoomRecurrenceRaw)) {
    return;
  }

  const zoomRecurrence = zoomRecurrenceRaw as Record<string, unknown>;
  const recurrenceTypeRaw = numberFromUnknown(zoomRecurrence.type);
  if (recurrenceTypeRaw === null || !Number.isInteger(recurrenceTypeRaw) || ![1, 2, 3].includes(recurrenceTypeRaw)) {
    throw new Error("Recurrencia Zoom invalida: type debe ser 1 (diaria), 2 (semanal) o 3 (mensual).");
  }
  const recurrenceType = recurrenceTypeRaw as 1 | 2 | 3;

  const repeatIntervalRaw = numberFromUnknown(zoomRecurrence.repeat_interval);
  const maxInterval = recurrenceType === 1 ? 90 : recurrenceType === 2 ? 12 : 3;
  if (
    repeatIntervalRaw === null ||
    !Number.isInteger(repeatIntervalRaw) ||
    repeatIntervalRaw < 1 ||
    repeatIntervalRaw > maxInterval
  ) {
    throw new Error(`Recurrencia Zoom invalida: repeat_interval debe estar entre 1 y ${maxInterval}.`);
  }
  const repeatInterval = repeatIntervalRaw as number;

  const hasEndTimes = zoomRecurrence.end_times !== undefined && zoomRecurrence.end_times !== null;
  const hasEndDateTime =
    typeof zoomRecurrence.end_date_time === "string" && zoomRecurrence.end_date_time.trim() !== "";

  if (hasEndTimes && hasEndDateTime) {
    throw new Error("Recurrencia Zoom invalida: end_times y end_date_time no pueden coexistir.");
  }

  if (hasEndTimes) {
    const endTimesRaw = numberFromUnknown(zoomRecurrence.end_times);
    if (endTimesRaw === null || !Number.isInteger(endTimesRaw) || endTimesRaw < 1 || endTimesRaw > 50) {
      throw new Error("Recurrencia Zoom invalida: end_times debe estar entre 1 y 50.");
    }
    const endTimes = endTimesRaw as number;
    if (endTimes < 1 || endTimes > 50) {
      throw new Error("Recurrencia Zoom invalida: end_times debe estar entre 1 y 50.");
    }
  }

  if (recurrenceType === 2) {
    const weeklyRaw = zoomRecurrence.weekly_days;
    const days =
      typeof weeklyRaw === "string"
        ? weeklyRaw.split(",").map((part) => Number(part.trim()))
        : Array.isArray(weeklyRaw)
          ? weeklyRaw.map((value) => Number(value))
          : [];

    if (days.length === 0 || days.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new Error("Recurrencia Zoom invalida: weekly_days debe contener dias entre 1 y 7.");
    }
  }

  if (recurrenceType === 3) {
    const monthlyDay = numberFromUnknown(zoomRecurrence.monthly_day);
    const monthlyWeek = numberFromUnknown(zoomRecurrence.monthly_week);
    const monthlyWeekDay = numberFromUnknown(zoomRecurrence.monthly_week_day);

    const hasMonthlyDay = monthlyDay !== null;
    const hasMonthlyWeekPair = monthlyWeek !== null || monthlyWeekDay !== null;

    if (hasMonthlyDay) {
      if (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31) {
        throw new Error("Recurrencia Zoom invalida: monthly_day debe estar entre 1 y 31.");
      }
      if (hasMonthlyWeekPair) {
        throw new Error("Recurrencia Zoom invalida: monthly_day no puede combinarse con monthly_week/monthly_week_day.");
      }
    } else {
      if (monthlyWeek === null || monthlyWeekDay === null) {
        throw new Error("Recurrencia Zoom invalida: para mensual debes definir monthly_day o monthly_week + monthly_week_day.");
      }
      if (!Number.isInteger(monthlyWeek) || ![-1, 1, 2, 3, 4].includes(monthlyWeek)) {
        throw new Error("Recurrencia Zoom invalida: monthly_week debe ser -1, 1, 2, 3 o 4.");
      }
      if (!Number.isInteger(monthlyWeekDay) || monthlyWeekDay < 1 || monthlyWeekDay > 7) {
        throw new Error("Recurrencia Zoom invalida: monthly_week_day debe estar entre 1 y 7.");
      }
    }
  }

  if (input.instanciasDetalle && input.instanciasDetalle.length > 50) {
    throw new Error("Recurrencia Zoom invalida: maximo 50 ocurrencias.");
  }
}

function buildInputWithZoomEndTimes(
  input: CreateSolicitudInput,
  instanceCount: number
): CreateSolicitudInput {
  if (input.tipoInstancias !== TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM) return input;
  if (!Number.isInteger(instanceCount) || instanceCount < 1) return input;

  const recurrenceRaw =
    input.patronRecurrencia && typeof input.patronRecurrencia === "object" && !Array.isArray(input.patronRecurrencia)
      ? (input.patronRecurrencia as Record<string, unknown>)
      : null;
  if (!recurrenceRaw) return input;

  const zoomRecurrenceRaw =
    recurrenceRaw.zoomRecurrence &&
    typeof recurrenceRaw.zoomRecurrence === "object" &&
    !Array.isArray(recurrenceRaw.zoomRecurrence)
      ? (recurrenceRaw.zoomRecurrence as Record<string, unknown>)
      : null;
  if (!zoomRecurrenceRaw) return input;

  const resolvedEndTimes = Math.max(1, Math.min(50, instanceCount));
  const { end_date_time: _removedEndDateTime, ...zoomRecurrenceWithoutEndDateTime } = zoomRecurrenceRaw;

  return {
    ...input,
    patronRecurrencia: {
      ...recurrenceRaw,
      zoomRecurrence: {
        ...zoomRecurrenceWithoutEndDateTime,
        end_times: resolvedEndTimes
      }
    }
  };
}

export class SalasService {
  async getDashboardSummary(user: SessionUser) {
    const canSeeAll = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;

    const whereSolicitudes = canSeeAll
      ? undefined
      : {
          docente: {
            usuarioId: user.id
          }
        };

    const [solicitudesTotales, manualPendings, eventosSinSoporte, agendaAbierta] =
      await Promise.all([
        db.solicitudSala.count({ where: whereSolicitudes }),
        db.solicitudSala.count({ where: { estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID } }),
        db.eventoZoom.count({ where: { estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR } }),
        db.eventoZoom.count({
          where: {
            requiereAsistencia: true,
            agendaAbiertaAt: { not: null },
            agendaCierraAt: { gt: new Date() }
          }
        })
      ]);

    return {
      solicitudesTotales,
      manualPendings,
      eventosSinSoporte,
      agendaAbierta
    };
  }

  async listSolicitudes(user: SessionUser) {
    const canSeeAll =
      user.role === UserRole.ADMINISTRADOR ||
      user.role === UserRole.CONTADURIA;

    const solicitudes = await db.solicitudSala.findMany({
      where: canSeeAll
        ? undefined
        : {
            docente: {
              usuarioId: user.id
            }
          },
      orderBy: { createdAt: "desc" },
      include: {
        eventos: {
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            id: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            estadoEvento: true,
            estadoCobertura: true,
            requiereAsistencia: true,
            zoomMeetingId: true,
            zoomJoinUrl: true,
            asignaciones: {
              where: {
                tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
                estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
              },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                asistente: {
                  select: {
                    usuario: {
                      select: {
                        email: true,
                        name: true,
                        firstName: true,
                        lastName: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        cuentaZoomAsignada: {
          select: {
            id: true,
            nombreCuenta: true,
            ownerEmail: true
          }
        },
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            lastName: true
          }
        }
      },
      take: 200
    });

    const meetingIds = [
      ...new Set(
        solicitudes
          .map((item) => normalizeZoomMeetingId(item.meetingPrincipalId))
          .filter((item): item is string => Boolean(item))
      )
    ];

    const snapshotsByMeetingId = new Map<string, ZoomMeetingSnapshot>();
    if (meetingIds.length > 0) {
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
        const maxReads = 80;
        for (const meetingId of meetingIds.slice(0, maxReads)) {
          const snapshot = await fetchZoomMeetingSnapshot(zoomClient, meetingId);
          if (snapshot) {
            snapshotsByMeetingId.set(meetingId, snapshot);
          }
        }
      } catch {
        // If Zoom is unavailable, fallback to local DB data.
      }
    }

    return solicitudes.map((solicitud) => {
      const meetingId = normalizeZoomMeetingId(solicitud.meetingPrincipalId);
      const snapshot = meetingId ? snapshotsByMeetingId.get(meetingId) : undefined;

      let fallbackInstances: ZoomOccurrenceSnapshot[] = solicitud.eventos.map((event) => {
        const monitor = event.asignaciones[0]?.asistente.usuario ?? null;
        const monitorNombre = monitor
          ? monitor.name ||
            [monitor.firstName, monitor.lastName].filter(Boolean).join(" ").trim() ||
            monitor.email
          : null;

        return {
          eventId: event.id,
          occurrenceId: null,
          startTime: event.inicioProgramadoAt.toISOString(),
          endTime: event.finProgramadoAt.toISOString(),
          durationMinutes: Math.max(
            1,
            Math.floor((event.finProgramadoAt.getTime() - event.inicioProgramadoAt.getTime()) / 60000)
          ),
          estadoEvento: event.estadoEvento,
          status: null,
          joinUrl: event.zoomJoinUrl ?? null,
          requiereAsistencia: event.requiereAsistencia,
          monitorNombre,
          monitorEmail: monitor?.email ?? null
        };
      });

      if (fallbackInstances.length === 0 && Array.isArray(solicitud.fechasInstancias)) {
        fallbackInstances = solicitud.fechasInstancias
          .map((item) => {
            if (typeof item !== "string") return undefined;
            const date = new Date(item);
            if (Number.isNaN(date.getTime())) return undefined;
            return {
              eventId: null,
              occurrenceId: null,
              startTime: date.toISOString(),
              endTime: new Date(
                date.getTime() +
                Math.max(
                  1,
                  Math.floor((solicitud.fechaFinSolicitada.getTime() - solicitud.fechaInicioSolicitada.getTime()) / 60000)
                ) * 60_000
              ).toISOString(),
              durationMinutes: Math.max(
                1,
                Math.floor((solicitud.fechaFinSolicitada.getTime() - solicitud.fechaInicioSolicitada.getTime()) / 60000)
              ),
              estadoEvento: null,
              status: null,
              joinUrl: null,
              requiereAsistencia: solicitud.requiereAsistencia,
              monitorNombre: null,
              monitorEmail: null
            } as ZoomOccurrenceSnapshot;
          })
          .filter((item): item is ZoomOccurrenceSnapshot => item !== undefined);
      }

      const snapshotInstances = snapshot?.instances ?? [];
      const zoomInstancesByMinute = new Map<number, ZoomOccurrenceSnapshot>();
      for (const fallback of fallbackInstances) {
        const parsed = new Date(fallback.startTime);
        if (Number.isNaN(parsed.getTime())) continue;
        const minuteKey = Math.floor(parsed.getTime() / 60_000);
        zoomInstancesByMinute.set(minuteKey, {
          ...fallback,
          joinUrl: fallback.joinUrl ?? snapshot?.joinUrl ?? null
        });
      }

      const canUseApproximateFallbackMatch =
        fallbackInstances.length > 0 &&
        snapshotInstances.length > 0 &&
        snapshotInstances.length === fallbackInstances.length;
      const consumedFallbackMinuteKeys = new Set<number>();

      for (const snapshotInstance of snapshotInstances) {
        const parsed = new Date(snapshotInstance.startTime);
        if (Number.isNaN(parsed.getTime())) continue;
        const match = resolveFallbackMinuteMatch(
          parsed,
          zoomInstancesByMinute,
          consumedFallbackMinuteKeys,
          canUseApproximateFallbackMatch
        );
        const minuteKey = match.minuteKey;
        const matchedFallback = match.matchedFallback ?? zoomInstancesByMinute.get(minuteKey);
        if (matchedFallback) {
          consumedFallbackMinuteKeys.add(minuteKey);
        }

        zoomInstancesByMinute.set(minuteKey, {
          eventId: matchedFallback?.eventId ?? null,
          occurrenceId: snapshotInstance.occurrenceId ?? matchedFallback?.occurrenceId ?? null,
          startTime: matchedFallback?.startTime ?? snapshotInstance.startTime,
          endTime:
            snapshotInstance.endTime ??
            matchedFallback?.endTime ??
            new Date(
              parsed.getTime() +
              Math.max(1, snapshotInstance.durationMinutes || matchedFallback?.durationMinutes || 60) *
              60_000
            ).toISOString(),
          durationMinutes: Math.max(1, snapshotInstance.durationMinutes || matchedFallback?.durationMinutes || 60),
          estadoEvento: matchedFallback?.estadoEvento ?? null,
          status: snapshotInstance.status ?? matchedFallback?.status ?? null,
          joinUrl:
            snapshotInstance.joinUrl ??
            matchedFallback?.joinUrl ??
            snapshot?.joinUrl ??
            null,
          requiereAsistencia: matchedFallback?.requiereAsistencia ?? solicitud.requiereAsistencia,
          monitorNombre: matchedFallback?.monitorNombre ?? null,
          monitorEmail: matchedFallback?.monitorEmail ?? null
        });
      }

      const zoomInstances = Array.from(zoomInstancesByMinute.values()).sort((a, b) => (
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ));
      const zoomJoinUrl =
        snapshot?.joinUrl ??
        zoomInstances.find((event) => event.joinUrl)?.joinUrl ??
        null;
      const zoomHostAccount =
        snapshot?.hostEmail ??
        solicitud.cuentaZoomAsignada?.ownerEmail ??
        solicitud.cuentaZoomAsignada?.nombreCuenta ??
        null;

      return {
        ...solicitud,
        requestedBy: {
          id: solicitud.createdBy.id,
          email: solicitud.createdBy.email,
          name:
            solicitud.createdBy.name ||
            [solicitud.createdBy.firstName, solicitud.createdBy.lastName].filter(Boolean).join(" ").trim() ||
            solicitud.createdBy.email
        },
        zoomJoinUrl,
        zoomHostAccount,
        zoomInstanceCount: zoomInstances.length || solicitud.cantidadInstancias || 1,
        zoomInstances,
        zoomReadFromApi: Boolean(snapshot)
      };
    });
  }

  async listPastMeetings(user: SessionUser) {
    if (user.role !== UserRole.ADMINISTRADOR) {
      throw new Error("Forbidden");
    }

    const now = new Date();
    const events = await db.eventoZoom.findMany({
      where: {
        zoomMeetingId: { not: null },
        OR: [
          { finRealAt: { lt: now } },
          {
            finRealAt: null,
            finProgramadoAt: { lt: now }
          }
        ]
      },
      orderBy: [{ finRealAt: "desc" }, { finProgramadoAt: "desc" }],
      include: {
        solicitud: {
          select: {
            id: true,
            titulo: true,
            docente: {
              select: {
                usuario: {
                  select: {
                    email: true,
                    name: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        },
        asignaciones: {
          where: { tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL },
          orderBy: { fechaAsignacionAt: "desc" },
          take: 1,
          select: {
            asistente: {
              select: {
                usuario: {
                  select: {
                    email: true,
                    name: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      },
      take: 200
    });

    return events
      .map((event) => {
        const meetingId = normalizeZoomMeetingId(event.zoomMeetingId);
        if (!meetingId) return null;

        const start = event.inicioRealAt ?? event.inicioProgramadoAt;
        const end = event.finRealAt ?? event.finProgramadoAt;
        const minutes =
          event.minutosReales ??
          Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));

        const docente = event.solicitud.docente.usuario;
        const docenteName =
          docente.name ||
          [docente.firstName, docente.lastName].filter(Boolean).join(" ").trim() ||
          docente.email;

        const monitor = event.asignaciones[0]?.asistente.usuario ?? null;
        const monitorName = monitor
          ? monitor.name ||
            [monitor.firstName, monitor.lastName].filter(Boolean).join(" ").trim() ||
            monitor.email
          : null;

        return {
          id: event.id,
          solicitudId: event.solicitud.id,
          titulo: event.solicitud.titulo,
          modalidadReunion: event.modalidadReunion,
          zoomMeetingId: meetingId,
          zoomJoinUrl: event.zoomJoinUrl ?? buildZoomJoinUrlFromMeetingId(meetingId),
          inicioAt: start.toISOString(),
          finAt: end.toISOString(),
          minutosReales: minutes,
          estadoEvento: event.estadoEvento,
          estadoEjecucion: event.estadoEjecucion,
          docenteNombre: docenteName,
          docenteEmail: docente.email,
          monitorNombre: monitorName,
          monitorEmail: monitor?.email ?? null
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async createSolicitud(user: SessionUser, input: CreateSolicitudInput) {
    validateZoomRecurrenceRestrictions(input);
    const docentesCopyEmails = parseDocentesEmailsByLine(input.docentesCorreos);
    const normalizedDocentesCorreos = normalizeDocentesCorreosForStorage(input.docentesCorreos);
    const docente = await getOrCreateDocente(user);
    const start = toDate(input.fechaInicioSolicitada, "fechaInicioSolicitada");
    const end = toDate(input.fechaFinSolicitada, "fechaFinSolicitada");
    const recurrenceEnd = input.fechaFinRecurrencia
      ? toDate(input.fechaFinRecurrencia, "fechaFinRecurrencia")
      : null;
    const timezone = input.timezone ?? "America/Montevideo";
    const shouldNotifyAdminsOnDocenteCreate = user.role === UserRole.DOCENTE;
    const grabacionPreferencia = input.grabacionPreferencia ?? "NO";
    const requiereGrabacion =
      input.requiereGrabacion ?? grabacionPreferencia === "SI";

    const notifyAdminsOnDocenteSolicitudCreate = async (
      solicitudId: string,
      estadoSolicitud: EstadoSolicitudSala,
      instanceStarts: Date[]
    ) => {
      if (!shouldNotifyAdminsOnDocenteCreate) return;

      await sendDocenteSolicitudCreatedEmailToAdmins({
        actorNombre: getUserDisplayName(user),
        actorEmail: user.email,
        solicitudId,
        titulo: input.titulo,
        programaNombre: input.programaNombre ?? null,
        modalidad: input.modalidadReunion,
        estadoSolicitud,
        timezone,
        instanceStarts
      }).catch((error) => {
        logger.warn("No se pudo enviar correo a admins por solicitud creada por docente.", {
          solicitudId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    };

    if (end <= start) {
      throw new Error("fechaFinSolicitada debe ser mayor a fechaInicioSolicitada.");
    }

    const durationMinutes = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const instancePlans = buildInstancePlans(input, durationMinutes);
    const inputForProvisioning = buildInputWithZoomEndTimes(input, instancePlans.length);
    validateZoomRecurrenceRestrictions(inputForProvisioning);
    const resolvedFechasInstancias =
      input.fechasInstancias ?? input.instanciasDetalle?.map((item) => item.inicioProgramadoAt);
    const availableAccounts = await listAvailableCuentaZoomCandidatesForAllInstances(instancePlans);
    const requireManualResolution =
      input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM &&
      (input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO) !==
        MeetingIdEstrategia.MULTIPLE_PERMITIDO;

    if (availableAccounts.length === 0) {
      const created = await db.solicitudSala.create({
        data: {
          docenteId: docente.id,
          createdByUserId: user.id,
          titulo: input.titulo,
          responsableNombre: input.responsableNombre,
          programaNombre: input.programaNombre,
          descripcion: input.descripcion,
          finalidadAcademica: input.finalidadAcademica,
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: input.tipoInstancias,
          meetingIdEstrategia: input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO,
          meetingPrincipalId: null,
          motivoMultiplesIds: requireManualResolution
            ? "El sistema no pudo asignar un único meeting ID para la solicitud." : null,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone,
          capacidadEstimada: input.capacidadEstimada,
          controlAsistencia: input.controlAsistencia ?? false,
          docentesCorreos: normalizedDocentesCorreos,
          grabacionPreferencia,
          requiereGrabacion,
          requiereAsistencia: input.requiereAsistencia ?? false,
          motivoAsistencia: input.motivoAsistencia,
          regimenEncuentros: input.regimenEncuentros,
          fechaFinRecurrencia: recurrenceEnd,
          patronRecurrencia: inputForProvisioning.patronRecurrencia as Prisma.InputJsonValue | undefined,
          fechasInstancias: resolvedFechasInstancias,
          cantidadInstancias: instancePlans.length,
          estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
          observacionesAdmin:
            "No se encontro una cuenta Zoom activa con disponibilidad para todas las fechas solicitadas. Requiere resolucion manual."
        }
      });

      await notifyAdminTelegramMovement({
        action: "SOLICITUD_CREADA_PENDIENTE_MANUAL",
        actorEmail: user.email,
        actorRole: user.role,
        entityType: "SolicitudSala",
        entityId: created.id,
        summary: input.titulo,
        details: {
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: input.tipoInstancias,
          cantidadInstancias: instancePlans.length,
          motivoSistema: "Sin capacidad automatica para todas las fechas solicitadas."
        }
      });

      await notifyAdminsOnDocenteSolicitudCreate(
        created.id,
        EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
        instancePlans.map((plan) => plan.inicio)
      );

      return created;
    }
    const shouldProvisionSpecificDatesWithMultipleMeetings =
      input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM &&
      (input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO) ===
        MeetingIdEstrategia.MULTIPLE_PERMITIDO;

    let assignedAccount: CuentaZoom | null = requireManualResolution ? availableAccounts[0] : null;
    let zoomSnapshot: ZoomMeetingSnapshot | null = null;
    let additionalZoomSnapshots: ZoomMeetingSnapshot[] = [];
    let lastProvisionError: string | null = null;

    if (!requireManualResolution) {
      if (
        !shouldProvisionSpecificDatesWithMultipleMeetings &&
        input.tipoInstancias !== TipoInstancias.UNICA &&
        input.tipoInstancias !== TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM
      ) {
        throw new Error("Solo se pueden crear automaticamente reuniones unicas o recurrentes compatibles con Zoom.");
      }

      for (const candidate of availableAccounts) {
        const candidateSnapshots: ZoomMeetingSnapshot[] = [];
        try {
          if (shouldProvisionSpecificDatesWithMultipleMeetings) {
            // meetings.json only supports patterned recurrence for type=8; for specific days
            // we provision one type=2 meeting per requested date.
            const singleMeetingInput: CreateSolicitudInput = {
              ...inputForProvisioning,
              tipoInstancias: TipoInstancias.UNICA,
              patronRecurrencia: undefined,
              fechaFinRecurrencia: undefined,
              fechasInstancias: undefined,
              instanciasDetalle: undefined
            };

            for (const plan of instancePlans) {
              const snapshot = await createZoomMeetingForSolicitud({
                accountOwnerEmail: candidate.ownerEmail,
                input: singleMeetingInput,
                start: plan.inicio,
                durationMinutes,
                timezone
              });
              candidateSnapshots.push(snapshot);
            }
          } else {
            const candidateSnapshot = await createZoomMeetingForSolicitud({
              accountOwnerEmail: candidate.ownerEmail,
              input: inputForProvisioning,
              start: instancePlans[0]?.inicio ?? start,
              durationMinutes,
              timezone
            });

            if (
              input.tipoInstancias === TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM &&
              !zoomSnapshotSupportsAllRequestedInstances(candidateSnapshot, instancePlans)
            ) {
              lastProvisionError =
                "La cuenta Zoom elegida no devolvio todas las ocurrencias de la recurrencia solicitada.";
              try {
                const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
                await rollbackClient.deleteMeeting(candidateSnapshot.meetingId, {
                  schedule_for_reminder: false,
                  cancel_meeting_reminder: false
                });
              } catch {
                // If rollback fails, continue trying another account.
              }
              continue;
            }

            candidateSnapshots.push(candidateSnapshot);
          }

          assignedAccount = candidate;
          zoomSnapshot = candidateSnapshots[0] ?? null;
          additionalZoomSnapshots = candidateSnapshots.slice(1);
          break;
        } catch (error) {
          lastProvisionError = error instanceof Error ? error.message : "Error al provisionar reunion en Zoom.";
          if (candidateSnapshots.length > 0) {
            for (const snapshot of candidateSnapshots) {
              try {
                const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
                await rollbackClient.deleteMeeting(snapshot.meetingId, {
                  schedule_for_reminder: false,
                  cancel_meeting_reminder: false
                });
              } catch {
                // Best effort rollback. Keep trying with the next account.
              }
            }
          }
        }
      }

      if (!assignedAccount || !zoomSnapshot) {
        const created = await db.solicitudSala.create({
          data: {
            docenteId: docente.id,
            createdByUserId: user.id,
            titulo: input.titulo,
            responsableNombre: input.responsableNombre,
            programaNombre: input.programaNombre,
            descripcion: input.descripcion,
            finalidadAcademica: input.finalidadAcademica,
            modalidadReunion: input.modalidadReunion,
            tipoInstancias: input.tipoInstancias,
            meetingIdEstrategia: input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO,
            meetingPrincipalId: zoomSnapshot?.meetingId ?? null,
            motivoMultiplesIds: requireManualResolution
              ? "El sistema no pudo asignar un único meeting ID para la solicitud." : null,
            fechaInicioSolicitada: start,
            fechaFinSolicitada: end,
            timezone,
            capacidadEstimada: input.capacidadEstimada,
            controlAsistencia: input.controlAsistencia ?? false,
            docentesCorreos: normalizedDocentesCorreos,
            grabacionPreferencia,
            requiereGrabacion,
            requiereAsistencia: input.requiereAsistencia ?? false,
            motivoAsistencia: input.motivoAsistencia,
            regimenEncuentros: input.regimenEncuentros,
            fechaFinRecurrencia: recurrenceEnd,
            patronRecurrencia: inputForProvisioning.patronRecurrencia as Prisma.InputJsonValue | undefined,
            fechasInstancias: resolvedFechasInstancias,
            cantidadInstancias: instancePlans.length,
            estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
            observacionesAdmin:
              lastProvisionError ??
              "No se encontro una cuenta Zoom que permita provisionar todas las fechas solicitadas. Requiere resolucion manual."
          }
        });

        await notifyAdminTelegramMovement({
          action: "SOLICITUD_CREADA_PENDIENTE_MANUAL",
          actorEmail: user.email,
          actorRole: user.role,
          entityType: "SolicitudSala",
          entityId: created.id,
          summary: input.titulo,
          details: {
            modalidadReunion: input.modalidadReunion,
            tipoInstancias: input.tipoInstancias,
            cantidadInstancias: instancePlans.length,
            cuentasProbadas: availableAccounts.length,
            motivoSistema:
              lastProvisionError ??
              "No se encontro una cuenta Zoom que permita provisionar todas las fechas solicitadas."
          }
        });

        await notifyAdminsOnDocenteSolicitudCreate(
          created.id,
          EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
          instancePlans.map((plan) => plan.inicio)
        );

        return created;
      }
    }

    if (!assignedAccount) {
      throw new Error("No se pudo seleccionar una cuenta Zoom para la solicitud.");
    }

    const allZoomSnapshots = zoomSnapshot ? [zoomSnapshot, ...additionalZoomSnapshots] : [];
    const provisionedPlans = shouldProvisionSpecificDatesWithMultipleMeetings
      ? buildProvisionedEventPlansFromIndependentMeetings(allZoomSnapshots, instancePlans, durationMinutes)
      : buildProvisionedEventPlans(zoomSnapshot, instancePlans, durationMinutes);
    const provisionedFechasInstancias = provisionedPlans.map((plan) => plan.inicio.toISOString());
    const hasMultipleMeetingIds = allZoomSnapshots.length > 1;
    const meetingPrincipalId: string | null = allZoomSnapshots[0]?.meetingId ?? null;
    const motivoMultiplesIds =
      requireManualResolution
        ? "El sistema no pudo asignar un unico meeting ID para la solicitud."
        : hasMultipleMeetingIds
          ? "La solicitud fue provisionada con multiples meeting IDs por fechas puntuales no compatibles con recurrencia Zoom."
          : null;

    const status = requireManualResolution
      ? EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID
      : EstadoSolicitudSala.PROVISIONADA;

    const result = await db.$transaction(async (tx) => {
      const solicitud = await tx.solicitudSala.create({
        data: {
          docenteId: docente.id,
          createdByUserId: user.id,
          cuentaZoomAsignadaId: assignedAccount.id,
          titulo: input.titulo,
          responsableNombre: input.responsableNombre,
          programaNombre: input.programaNombre,
          descripcion: input.descripcion,
          finalidadAcademica: input.finalidadAcademica,
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: input.tipoInstancias,
          meetingIdEstrategia: input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO,
          meetingPrincipalId,
          motivoMultiplesIds,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone,
          capacidadEstimada: input.capacidadEstimada,
          controlAsistencia: input.controlAsistencia ?? false,
          docentesCorreos: normalizedDocentesCorreos,
          grabacionPreferencia,
          requiereGrabacion,
          requiereAsistencia: input.requiereAsistencia ?? false,
          motivoAsistencia: input.motivoAsistencia,
          regimenEncuentros: input.regimenEncuentros,
          fechaFinRecurrencia: recurrenceEnd,
          patronRecurrencia: inputForProvisioning.patronRecurrencia as Prisma.InputJsonValue | undefined,
          fechasInstancias: requireManualResolution ? resolvedFechasInstancias : provisionedFechasInstancias,
          cantidadInstancias: requireManualResolution ? instancePlans.length : provisionedPlans.length,
          estadoSolicitud: status
        }
      });

      const tarifa = await getActiveRate(input.modalidadReunion);
      const rate = tarifa ? Number(tarifa.valorHora) : 0;
      const estimatedCost = calculateEstimatedCost(durationMinutes, rate);

      if (!requireManualResolution) {
        await tx.eventoZoom.createMany({
          data: provisionedPlans.map((plan) => ({
            solicitudSalaId: solicitud.id,
            cuentaZoomId: assignedAccount.id,
            tipoEvento:
              provisionedPlans.length > 1 ? TipoEventoZoom.RECURRENCE_INSTANCE : TipoEventoZoom.SINGLE,
            grupoRecurrenciaId: provisionedPlans.length > 1 ? solicitud.id : null,
            modalidadReunion: input.modalidadReunion,
            inicioProgramadoAt: plan.inicio,
            finProgramadoAt: plan.fin,
            timezone,
            requiereAsistencia: input.requiereAsistencia ?? false,
            estadoCobertura: input.requiereAsistencia
              ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
              : EstadoCoberturaSoporte.NO_REQUIERE,
            agendaAbiertaAt: input.requiereAsistencia ? new Date() : null,
            agendaCierraAt: input.requiereAsistencia
              ? new Date(plan.inicio.getTime() - 24 * 60 * 60000)
              : null,
            estadoEvento: "PROGRAMADO",
            zoomMeetingId: plan.zoomMeetingId,
            zoomJoinUrl: plan.joinUrl,
            zoomStartUrl: plan.zoomStartUrl ?? null,
            zoomPayloadUltimo: plan.zoomPayloadUltimo,
            sincronizadoConZoomAt: new Date(),
            costoEstimado: estimatedCost
          }))
        });
      }

      if (requireManualResolution) {
        const admins = await tx.user.findMany({
          where: { role: UserRole.ADMINISTRADOR }
        });

        await tx.notificacion.createMany({
          data: admins.map((admin) => ({
            usuarioId: admin.id,
            tipoNotificacion: TipoNotificacion.ALERTA_OPERATIVA,
            canalDestino: admin.email,
            asunto: "Solicitud pendiente por resolución manual de ID Zoom",
            cuerpo:
              `Solicitud ${solicitud.id}: no se pudo asegurar un único ID de reunión. ` +
              "Se requiere intervención administrativa y registro manual.",
            entidadReferenciaTipo: "SolicitudSala",
            entidadReferenciaId: solicitud.id
          }))
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "SOLICITUD_CREADA",
          entidadTipo: "SolicitudSala",
          entidadId: solicitud.id,
          valorNuevo: {
            estadoSolicitud: status,
            meetingPrincipalId
          }
        }
      });

      return solicitud;
    }).catch(async (error) => {
      if (!requireManualResolution) {
        const rollbackMeetingIds = Array.from(
          new Set(
            [zoomSnapshot, ...additionalZoomSnapshots]
              .map((item) => item?.meetingId)
              .filter((item): item is string => Boolean(item))
          )
        );

        for (const meetingId of rollbackMeetingIds) {
          try {
            const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
            await rollbackClient.deleteMeeting(meetingId, {
              schedule_for_reminder: false,
              cancel_meeting_reminder: false
            });
          } catch {
            try {
              const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
              await rollbackClient.updateMeetingStatus(meetingId, "end");
            } catch {
              // Keep original DB error.
            }
          }
        }
      }
      throw error;
    });

    await notifyAdminTelegramMovement({
      action: requireManualResolution ? "SOLICITUD_CREADA_PENDIENTE_MANUAL" : "SOLICITUD_CREADA",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "SolicitudSala",
      entityId: result.id,
      summary: input.titulo,
      details: {
        modalidadReunion: input.modalidadReunion,
        tipoInstancias: input.tipoInstancias,
        estadoSolicitud: status,
        cantidadInstancias: requireManualResolution ? instancePlans.length : provisionedPlans.length,
        meetingPrincipalId,
        requiereAsistencia: input.requiereAsistencia ?? false
      }
    });

    if (!requireManualResolution && status === EstadoSolicitudSala.PROVISIONADA) {
      const primaryZoomSnapshot = allZoomSnapshots[0] ?? null;
      const joinUrl =
        primaryZoomSnapshot?.joinUrl ??
        provisionedPlans.find((plan) => typeof plan.joinUrl === "string" && plan.joinUrl)?.joinUrl ??
        null;
      const hostAccount = primaryZoomSnapshot?.hostEmail ?? assignedAccount.ownerEmail ?? assignedAccount.nombreCuenta ?? null;
      const responsibleEmail = await resolveResponsibleNotificationEmail(input.responsableNombre);
      const confirmationCc = [
        ...docentesCopyEmails,
        ...(responsibleEmail ? [responsibleEmail] : [])
      ];

      await sendProvisionedSolicitudEmail({
        to: user.email,
        cc: confirmationCc,
        solicitudId: result.id,
        titulo: input.titulo,
        modalidad: input.modalidadReunion,
        meetingId: meetingPrincipalId,
        joinUrl,
        hostAccount,
        rawPayload: primaryZoomSnapshot?.rawPayload,
        timezone,
        instanceStarts: provisionedPlans.map((plan) => plan.inicio)
      }).catch((error) => {
        logger.warn("No se pudo enviar correo de confirmacion de solicitud provisionada.", {
          solicitudId: result.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    if (input.requiereAsistencia ?? false) {
      const startsForAssistantPool =
        provisionedPlans.length > 0
          ? provisionedPlans.map((plan) => plan.inicio)
          : instancePlans.map((plan) => plan.inicio);

      await sendMonitoringRequiredEmailToAssistantPool({
        solicitudId: result.id,
        titulo: input.titulo,
        modalidad: input.modalidadReunion,
        programaNombre: input.programaNombre ?? null,
        responsableNombre: input.responsableNombre ?? null,
        timezone,
        instanceStarts: startsForAssistantPool,
        estadoSolicitud: status
      }).catch((error) => {
        logger.warn("No se pudo enviar correo al pool de asistentes Zoom.", {
          solicitudId: result.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    await notifyAdminsOnDocenteSolicitudCreate(
      result.id,
      status,
      provisionedPlans.length > 0
        ? provisionedPlans.map((plan) => plan.inicio)
        : instancePlans.map((plan) => plan.inicio)
    );

    return result;
  }

  async cancelSolicitud(
    user: SessionUser,
    solicitudId: string,
    input: {
      scope: "SERIE" | "INSTANCIA";
      eventoId?: string;
      occurrenceId?: string;
      inicioProgramadoAt?: string;
      motivo?: string;
    }
  ) {
    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: {
        id: true,
        titulo: true,
        createdByUserId: true,
        meetingPrincipalId: true,
        tipoInstancias: true,
        estadoSolicitud: true,
        docente: {
          select: {
            usuarioId: true
          }
        },
        eventos: {
          select: {
            id: true,
            inicioProgramadoAt: true,
            estadoEvento: true,
            zoomMeetingId: true
          },
          orderBy: { inicioProgramadoAt: "asc" }
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
    }

    const canManageAsAdmin = user.role === UserRole.ADMINISTRADOR;
    const ownsSolicitud =
      solicitud.createdByUserId === user.id || solicitud.docente.usuarioId === user.id;

    if (!canManageAsAdmin && !ownsSolicitud) {
      throw new Error("No tienes permisos para cancelar esta solicitud.");
    }

    const meetingCandidates = [
      solicitud.meetingPrincipalId,
      ...solicitud.eventos.map((item) => item.zoomMeetingId)
    ];
    const zoomMeetingId =
      meetingCandidates
        .map((raw) => normalizeZoomMeetingId(raw))
        .find((value): value is string => Boolean(value)) ?? null;

    const cancelledStatus =
      user.role === UserRole.ADMINISTRADOR
        ? EstadoSolicitudSala.CANCELADA_ADMIN
        : EstadoSolicitudSala.CANCELADA_DOCENTE;

    if (input.scope === "SERIE") {
      let cancelledInZoom = false;
      if (zoomMeetingId) {
        try {
          const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
          await zoomClient.deleteMeeting(zoomMeetingId, {
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
          cancelledInZoom = true;
        } catch (error) {
          if (error instanceof ZoomApiError && (error.status === 404 || error.code === 3001)) {
            cancelledInZoom = false;
          } else {
            throw new Error(
              error instanceof Error
                ? `No se pudo cancelar la serie en Zoom: ${error.message}`
                : "No se pudo cancelar la serie en Zoom."
            );
          }
        }
      }

      const updatedEvents = await db.$transaction(async (tx) => {
        const eventsResult = await tx.eventoZoom.updateMany({
          where: {
            solicitudSalaId: solicitud.id,
            estadoEvento: { in: [EstadoEventoZoom.PENDIENTE_CREACION, EstadoEventoZoom.CREADO_ZOOM, EstadoEventoZoom.ERROR_INTEGRACION, EstadoEventoZoom.PROGRAMADO] }
          },
          data: {
            estadoEvento: EstadoEventoZoom.CANCELADO,
            estadoCobertura: EstadoCoberturaSoporte.CANCELADO
          }
        });

        await tx.solicitudSala.update({
          where: { id: solicitud.id },
          data: {
            estadoSolicitud: cancelledStatus,
            canceladaPorDocenteAt: new Date(),
            canceladaMotivo: input.motivo ?? "Serie cancelada desde la plataforma."
          }
        });

        await tx.auditoria.create({
          data: {
            actorUsuarioId: user.id,
            accion: "SOLICITUD_CANCELADA_SERIE",
            entidadTipo: "SolicitudSala",
            entidadId: solicitud.id,
            valorNuevo: {
              zoomMeetingId,
              cancelledInZoom,
              updatedEvents: eventsResult.count
            }
          }
        });

        return eventsResult.count;
      });

      await notifyAdminTelegramMovement({
        action: "SOLICITUD_CANCELADA_SERIE",
        actorEmail: user.email,
        actorRole: user.role,
        entityType: "SolicitudSala",
        entityId: solicitud.id,
        summary: solicitud.titulo,
        details: {
          zoomMeetingId,
          cancelledInZoom,
          updatedEvents
        }
      });

      return {
        scope: "SERIE" as const,
        solicitudId: solicitud.id,
        zoomMeetingId,
        cancelledInZoom,
        updatedEvents
      };
    }

    const targetEventById = input.eventoId
      ? solicitud.eventos.find((event) => event.id === input.eventoId)
      : null;
    const targetStartMs = input.inicioProgramadoAt ? new Date(input.inicioProgramadoAt).getTime() : NaN;
    const targetEventByStart = !targetEventById && Number.isFinite(targetStartMs)
      ? solicitud.eventos.find(
          (event) => Math.abs(event.inicioProgramadoAt.getTime() - targetStartMs) <= 60_000
        )
      : null;
    const targetEvent = targetEventById ?? targetEventByStart ?? null;

    if (!targetEvent) {
      throw new Error("No se encontro la instancia a cancelar.");
    }
    if (targetEvent.estadoEvento === EstadoEventoZoom.CANCELADO) {
      throw new Error("La instancia ya estaba cancelada.");
    }
    if (targetEvent.estadoEvento === EstadoEventoZoom.FINALIZADO) {
      throw new Error("No se puede cancelar una instancia finalizada.");
    }

    let occurrenceId = input.occurrenceId?.trim() || null;
    let cancelledInZoom = false;

    if (zoomMeetingId) {
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();

        if (solicitud.tipoInstancias === TipoInstancias.UNICA || solicitud.eventos.length <= 1) {
          await zoomClient.deleteMeeting(zoomMeetingId, {
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
          cancelledInZoom = true;
        } else {
          if (!occurrenceId) {
            const snapshot = await fetchZoomMeetingSnapshot(zoomClient, zoomMeetingId);
            const matched = snapshot?.instances.find((instance) => {
              const instanceStart = new Date(instance.startTime);
              return Math.abs(instanceStart.getTime() - targetEvent.inicioProgramadoAt.getTime()) <= 60_000;
            });
            occurrenceId = matched?.occurrenceId ?? null;
          }

          if (!occurrenceId) {
            throw new Error(
              "No se pudo resolver el occurrence_id de Zoom para cancelar la instancia."
            );
          }

          await zoomClient.deleteMeeting(zoomMeetingId, {
            occurrence_id: occurrenceId,
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
          cancelledInZoom = true;
        }
      } catch (error) {
        if (error instanceof ZoomApiError && (error.status === 404 || error.code === 3001)) {
          cancelledInZoom = false;
        } else {
          throw new Error(
            error instanceof Error
              ? `No se pudo cancelar la instancia en Zoom: ${error.message}`
              : "No se pudo cancelar la instancia en Zoom."
          );
        }
      }
    }

    const result = await db.$transaction(async (tx) => {
      await tx.eventoZoom.update({
        where: { id: targetEvent.id },
        data: {
          estadoEvento: EstadoEventoZoom.CANCELADO,
          estadoCobertura: EstadoCoberturaSoporte.CANCELADO
        }
      });

      const activeEvents = await tx.eventoZoom.count({
        where: {
          solicitudSalaId: solicitud.id,
          estadoEvento: { notIn: [EstadoEventoZoom.CANCELADO, EstadoEventoZoom.FINALIZADO] }
        }
      });

      if (activeEvents === 0) {
        await tx.solicitudSala.update({
          where: { id: solicitud.id },
          data: {
            estadoSolicitud: cancelledStatus,
            canceladaPorDocenteAt: new Date(),
            canceladaMotivo: input.motivo ?? "Todas las instancias fueron canceladas."
          }
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "SOLICITUD_CANCELADA_INSTANCIA",
          entidadTipo: "EventoZoom",
          entidadId: targetEvent.id,
          valorNuevo: {
            solicitudId: solicitud.id,
            occurrenceId,
            zoomMeetingId,
            cancelledInZoom
          }
        }
      });

      return {
        activeEvents
      };
    });

    await notifyAdminTelegramMovement({
      action: "SOLICITUD_CANCELADA_INSTANCIA",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "EventoZoom",
      entityId: targetEvent.id,
      summary: solicitud.titulo,
      details: {
        solicitudId: solicitud.id,
        occurrenceId,
        zoomMeetingId,
        cancelledInZoom
      }
    });

    return {
      scope: "INSTANCIA" as const,
      solicitudId: solicitud.id,
      eventoId: targetEvent.id,
      occurrenceId,
      zoomMeetingId,
      cancelledInZoom,
      activeEvents: result.activeEvents
    };
  }

  async deleteSolicitud(user: SessionUser, solicitudId: string) {
    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: {
        id: true,
        titulo: true,
        createdByUserId: true,
        meetingPrincipalId: true,
        docente: {
          select: {
            usuarioId: true
          }
        },
        eventos: {
          select: {
            zoomMeetingId: true
          },
          orderBy: { inicioProgramadoAt: "asc" },
          take: 10
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
    }

    const canDeleteAsAdmin = user.role === UserRole.ADMINISTRADOR;
    const ownsSolicitud =
      solicitud.createdByUserId === user.id || solicitud.docente.usuarioId === user.id;

    if (!canDeleteAsAdmin && !ownsSolicitud) {
      throw new Error("No tienes permisos para eliminar esta solicitud.");
    }

    const lockedByLiquidacion = await db.liquidacionDetalle.count({
      where: {
        evento: {
          solicitudSalaId: solicitud.id
        }
      }
    });
    if (lockedByLiquidacion > 0) {
      throw new Error(
        "No se puede eliminar: la solicitud ya fue usada en una liquidacion."
      );
    }

    const meetingCandidates = [
      solicitud.meetingPrincipalId,
      ...solicitud.eventos.map((item) => item.zoomMeetingId)
    ];
    const zoomMeetingId =
      meetingCandidates
        .map((raw) => normalizeZoomMeetingId(raw))
        .find((value): value is string => Boolean(value)) ?? null;

    let deletedInZoom = false;
    if (zoomMeetingId) {
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
        await zoomClient.deleteMeeting(zoomMeetingId, {
          schedule_for_reminder: false,
          cancel_meeting_reminder: false
        });
        deletedInZoom = true;
      } catch (error) {
        if (error instanceof ZoomApiError && (error.status === 404 || error.code === 3001)) {
          deletedInZoom = false;
        } else {
          throw new Error(
            error instanceof Error
              ? `No se pudo eliminar la reunion en Zoom: ${error.message}`
              : "No se pudo eliminar la reunion en Zoom."
          );
        }
      }
    }

    try {
      await db.$transaction(async (tx) => {
        await tx.solicitudSala.delete({ where: { id: solicitud.id } });
        await tx.auditoria.create({
          data: {
            actorUsuarioId: user.id,
            accion: "SOLICITUD_ELIMINADA",
            entidadTipo: "SolicitudSala",
            entidadId: solicitud.id,
            valorAnterior: {
              titulo: solicitud.titulo,
              meetingPrincipalId: solicitud.meetingPrincipalId
            },
            valorNuevo: {
              eliminada: true,
              zoomMeetingId,
              deletedInZoom
            }
          }
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new Error("No se puede eliminar por dependencias relacionadas.");
      }
      throw error;
    }

    await notifyAdminTelegramMovement({
      action: "SOLICITUD_ELIMINADA",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "SolicitudSala",
      entityId: solicitud.id,
      summary: solicitud.titulo,
      details: {
        zoomMeetingId,
        deletedInZoom
      }
    });

    return {
      id: solicitud.id,
      zoomMeetingId,
      deletedInZoom
    };
  }

  async listManualProvisionPendings() {
    return db.solicitudSala.findMany({
      where: { estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID },
      include: {
        docente: {
          include: {
            usuario: {
              select: { email: true, name: true }
            }
          }
        },
        cuentaZoomAsignada: true
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async resolveManualProvision(
    user: SessionUser,
    solicitudId: string,
    input: {
      cuentaZoomAsignadaId: string;
      accionTomada: string;
      motivoSistema: string;
      zoomMeetingIdManual: string;
      zoomJoinUrlManual?: string;
      observaciones?: string;
    }
  ) {
    const solicitud = await db.solicitudSala.findUnique({ where: { id: solicitudId } });
    if (!solicitud) throw new Error("Solicitud no encontrada.");
    if (solicitud.estadoSolicitud !== EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID) {
      throw new Error("La solicitud no está pendiente de resolución manual.");
    }

    const account = await db.cuentaZoom.findUnique({ where: { id: input.cuentaZoomAsignadaId } });
    if (!account || !account.activa) {
      throw new Error("Cuenta Zoom inválida para resolución manual.");
    }

    const minutes = Math.floor(
      (solicitud.fechaFinSolicitada.getTime() - solicitud.fechaInicioSolicitada.getTime()) / 60000
    );

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.solicitudSala.update({
        where: { id: solicitudId },
        data: {
          estadoSolicitud: EstadoSolicitudSala.PROVISIONADA,
          cuentaZoomAsignadaId: account.id,
          meetingPrincipalId: input.zoomMeetingIdManual,
          observacionesAdmin: input.observaciones,
          motivoMultiplesIds: null
        }
      });

      await tx.eventoZoom.create({
        data: {
          solicitudSalaId: solicitudId,
          cuentaZoomId: account.id,
          tipoEvento: TipoEventoZoom.SINGLE,
          modalidadReunion: solicitud.modalidadReunion,
          inicioProgramadoAt: solicitud.fechaInicioSolicitada,
          finProgramadoAt: solicitud.fechaFinSolicitada,
          timezone: solicitud.timezone,
          requiereAsistencia: solicitud.requiereAsistencia,
          estadoCobertura: solicitud.requiereAsistencia
            ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
            : EstadoCoberturaSoporte.NO_REQUIERE,
          agendaAbiertaAt: solicitud.requiereAsistencia ? new Date() : null,
          agendaCierraAt: solicitud.requiereAsistencia
            ? new Date(solicitud.fechaInicioSolicitada.getTime() - 24 * 60 * 60000)
            : null,
          estadoEvento: "PROGRAMADO",
          zoomMeetingId: input.zoomMeetingIdManual,
          zoomJoinUrl: input.zoomJoinUrlManual ?? `https://zoom.us/j/${input.zoomMeetingIdManual}`,
          costoEstimado: calculateEstimatedCost(minutes, 0)
        }
      });

      await tx.resolucionManualProvision.create({
        data: {
          solicitudSalaId: solicitudId,
          usuarioAdministradorId: user.id,
          cuentaZoomAsignadaId: account.id,
          motivoSistema: input.motivoSistema,
          accionTomada: input.accionTomada,
          zoomMeetingIdManual: input.zoomMeetingIdManual,
          zoomJoinUrlManual: input.zoomJoinUrlManual,
          observaciones: input.observaciones
        }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "RESOLUCION_MANUAL_PROVISION",
          entidadTipo: "SolicitudSala",
          entidadId: solicitudId,
          valorNuevo: {
            cuentaZoomAsignadaId: account.id,
            meetingPrincipalId: input.zoomMeetingIdManual
          }
        }
      });

      return updated;
    });

    await notifyAdminTelegramMovement({
      action: "RESOLUCION_MANUAL_PROVISION",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "SolicitudSala",
      entityId: solicitudId,
      summary: `meetingId=${input.zoomMeetingIdManual}`,
      details: {
        cuentaZoomAsignadaId: account.id,
        accionTomada: input.accionTomada
      }
    });

    const creator = await db.user.findUnique({
      where: { id: solicitud.createdByUserId },
      select: { email: true }
    });
    let docentesCopyEmails: string[] = [];
    try {
      docentesCopyEmails = parseDocentesEmailsByLine(solicitud.docentesCorreos);
    } catch (error) {
      logger.warn("No se pudieron interpretar correos de docentes para copia en resolucion manual.", {
        solicitudId: result.id,
        error: error instanceof Error ? error.message : String(error)
      });
      docentesCopyEmails = [];
    }
    const manualInstanceStarts = [new Date(solicitud.fechaInicioSolicitada)];
    const responsibleEmail = await resolveResponsibleNotificationEmail(solicitud.responsableNombre);
    const confirmationCc = [
      ...docentesCopyEmails,
      ...(responsibleEmail ? [responsibleEmail] : [])
    ];

    if (creator?.email) {
      await sendProvisionedSolicitudEmail({
        to: creator.email,
        cc: confirmationCc,
        solicitudId: result.id,
        titulo: solicitud.titulo,
        modalidad: solicitud.modalidadReunion,
        meetingId: input.zoomMeetingIdManual,
        joinUrl: input.zoomJoinUrlManual ?? `https://zoom.us/j/${input.zoomMeetingIdManual}`,
        hostAccount: account.ownerEmail ?? account.nombreCuenta ?? null,
        timezone: solicitud.timezone,
        instanceStarts: manualInstanceStarts
      }).catch((error) => {
        logger.warn("No se pudo enviar correo de confirmacion tras resolucion manual.", {
          solicitudId: result.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    return result;
  }

  async listOpenAgenda(user: SessionUser) {
    const assistant = await getOrCreateAsistente(user);

    const events = await db.eventoZoom.findMany({
      where: {
        requiereAsistencia: true,
        estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR,
        agendaCierraAt: { gt: new Date() }
      },
      include: {
        cuentaZoom: {
          select: {
            nombreCuenta: true,
            ownerEmail: true
          }
        },
        solicitud: {
          select: {
            titulo: true,
            modalidadReunion: true,
            programaNombre: true,
            responsableNombre: true,
            patronRecurrencia: true,
            docente: {
              include: {
                usuario: {
                  select: { email: true, name: true, firstName: true, lastName: true }
                }
              }
            }
          }
        },
        asignaciones: {
          where: {
            tipoAsignacion: "PRINCIPAL",
            estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
          },
          take: 1,
          select: {
            asistente: {
              select: {
                usuario: {
                  select: { name: true, firstName: true, lastName: true, email: true }
                }
              }
            }
          }
        },
        intereses: {
          where: { asistenteZoomId: assistant.id },
          take: 1,
          select: {
            id: true,
            estadoInteres: true,
            comentario: true,
            fechaRespuestaAt: true
          }
        }
      },
      orderBy: { inicioProgramadoAt: "asc" }
    });

    return events;
  }

  async listAssignmentBoard() {
    const [events, assistants] = await Promise.all([
      db.eventoZoom.findMany({
        where: {
          requiereAsistencia: true,
          estadoCobertura: {
            in: [
              EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR,
              EstadoCoberturaSoporte.ASIGNADO,
              EstadoCoberturaSoporte.CONFIRMADO
            ]
          },
          estadoEvento: { in: [EstadoEventoZoom.CREADO_ZOOM, EstadoEventoZoom.PROGRAMADO] },
          inicioProgramadoAt: { gt: new Date() }
        },
        include: {
          cuentaZoom: {
            select: {
              nombreCuenta: true,
              ownerEmail: true
            }
          },
          solicitud: {
            select: {
              titulo: true,
              modalidadReunion: true,
              programaNombre: true,
              responsableNombre: true,
              docente: {
                include: {
                  usuario: {
                    select: { email: true, name: true, firstName: true, lastName: true }
                  }
                }
              }
            }
          },
          intereses: {
            where: { estadoInteres: EstadoInteresAsistente.ME_INTERESA },
            select: {
              asistenteZoomId: true,
              asistente: {
                select: {
                  usuario: {
                    select: { email: true, name: true, firstName: true, lastName: true }
                  }
                }
              }
            }
          },
          asignaciones: {
            where: {
              tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
              estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
            },
            select: {
              estadoAsignacion: true,
              asistenteZoomId: true,
              asistente: {
                select: {
                  usuario: {
                    select: { email: true, name: true, firstName: true, lastName: true }
                  }
                }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 1
          }
        },
        orderBy: { inicioProgramadoAt: "asc" }
      }),
      db.asistenteZoom.findMany({
        where: {
          disponibleGeneral: true,
          usuario: {
            role: { in: [UserRole.ASISTENTE_ZOOM, UserRole.SOPORTE_ZOOM] }
          }
        },
        include: {
          usuario: {
            select: { email: true, name: true, firstName: true, lastName: true }
          }
        },
        orderBy: {
          usuario: {
            email: "asc"
          }
        }
      })
    ]);

    return {
      events: events.map((event) => {
        const currentAssignment = event.asignaciones[0] ?? null;
        const currentAssignmentUser = currentAssignment?.asistente?.usuario ?? null;

        return {
          id: event.id,
          inicioProgramadoAt: event.inicioProgramadoAt,
          finProgramadoAt: event.finProgramadoAt,
          modalidadReunion: event.modalidadReunion,
          estadoCobertura: event.estadoCobertura,
          zoomMeetingId: event.zoomMeetingId,
          zoomJoinUrl: event.zoomJoinUrl,
          cuentaZoom: event.cuentaZoom,
          solicitud: event.solicitud,
          currentAssignment: currentAssignment
            ? {
                asistenteZoomId: currentAssignment.asistenteZoomId,
                estadoAsignacion: currentAssignment.estadoAsignacion,
                email: currentAssignmentUser?.email ?? "",
                nombre:
                  currentAssignmentUser?.name ||
                  [currentAssignmentUser?.firstName, currentAssignmentUser?.lastName]
                    .filter(Boolean)
                    .join(" ") ||
                  currentAssignmentUser?.email ||
                  currentAssignment.asistenteZoomId
              }
            : null,
          interesados: event.intereses.map((interest) => {
            const user = interest.asistente?.usuario;
            return {
              asistenteZoomId: interest.asistenteZoomId,
              email: user?.email ?? "",
              nombre:
                user?.name ||
                [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                user?.email ||
                interest.asistenteZoomId
            };
          })
        };
      }),
      assistants: assistants.map((assistant) => ({
        id: assistant.id,
        email: assistant.usuario.email,
        nombre:
          assistant.usuario.name ||
          [assistant.usuario.firstName, assistant.usuario.lastName].filter(Boolean).join(" ") ||
          assistant.usuario.email
      }))
    };
  }

  async setInterest(
    user: SessionUser,
    eventoId: string,
    input: { estadoInteres: EstadoInteresAsistente; comentario?: string }
  ) {
    const assistant = await getOrCreateAsistente(user);

    const event = await db.eventoZoom.findUnique({
      where: { id: eventoId },
      select: {
        id: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        timezone: true,
        agendaCierraAt: true,
        solicitud: {
          select: {
            id: true,
            titulo: true,
            programaNombre: true
          }
        }
      }
    });
    if (!event) throw new Error("Evento no encontrado.");
    if (!event.agendaCierraAt || event.agendaCierraAt <= new Date()) {
      throw new Error("La agenda de interés está cerrada para este evento.");
    }

    const interest = await db.interesAsistenteEvento.upsert({
      where: {
        eventoZoomId_asistenteZoomId: {
          eventoZoomId: eventoId,
          asistenteZoomId: assistant.id
        }
      },
      update: {
        estadoInteres: input.estadoInteres,
        comentario: input.comentario,
        fechaRespuestaAt: new Date()
      },
      create: {
        eventoZoomId: eventoId,
        asistenteZoomId: assistant.id,
        estadoInteres: input.estadoInteres,
        comentario: input.comentario
      }
    });

    await notifyAdminTelegramMovement({
      action: "INTERES_ASISTENTE_ACTUALIZADO",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "EventoZoom",
      entityId: eventoId,
      details: {
        estadoInteres: input.estadoInteres,
        asistenteZoomId: assistant.id
      }
    });

    await sendAssistantPreferenceEmailToAdmins({
      asistenteNombre: getUserDisplayName(user),
      asistenteEmail: user.email,
      estadoInteres: input.estadoInteres,
      comentario: input.comentario,
      solicitudId: event.solicitud.id,
      eventoId: event.id,
      titulo: event.solicitud.titulo,
      programaNombre: event.solicitud.programaNombre ?? null,
      inicio: event.inicioProgramadoAt,
      fin: event.finProgramadoAt,
      timezone: event.timezone || "America/Montevideo"
    }).catch((error) => {
      logger.warn("No se pudo enviar correo a admins por preferencia de asistente.", {
        eventoId,
        asistenteZoomId: assistant.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return interest;
  }

  async assignAssistant(
    admin: SessionUser,
    eventoId: string,
    input: { asistenteZoomId: string; motivoAsignacion?: string }
  ) {
    const event = await db.eventoZoom.findUnique({
      where: { id: eventoId },
      select: {
        id: true,
        modalidadReunion: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        timezone: true,
        zoomJoinUrl: true,
        solicitud: {
          select: {
            id: true,
            titulo: true,
            programaNombre: true,
            responsableNombre: true,
            docente: {
              select: {
                usuario: {
                  select: {
                    email: true,
                    name: true,
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!event) throw new Error("Evento no encontrado.");

    const selectedAssistant = await db.asistenteZoom.findUnique({
      where: { id: input.asistenteZoomId },
      select: {
        id: true,
        usuario: {
          select: {
            email: true,
            name: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });
    if (!selectedAssistant?.usuario?.email) {
      throw new Error("No existe el asistente seleccionado.");
    }

    const rate = await getActiveRate(event.modalidadReunion);
    if (!rate) {
      throw new Error("No hay tarifa activa para la modalidad del evento.");
    }

    const minutes = Math.max(
      0,
      Math.floor((event.finProgramadoAt.getTime() - event.inicioProgramadoAt.getTime()) / 60000)
    );
    const hourlyRate = Number(rate.valorHora);

    const assignment = await db.$transaction(async (tx) => {
      const existingAssignments = await tx.asignacionAsistente.findMany({
        where: {
          asistenteZoomId: input.asistenteZoomId,
          eventoZoomId: { not: eventoId },
          estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
        },
        select: {
          eventoZoomId: true,
          evento: {
            select: {
              inicioProgramadoAt: true,
              finProgramadoAt: true,
              estadoEvento: true
            }
          }
        }
      });

      const bufferMs = 30 * 60 * 1000;
      const currentStart = event.inicioProgramadoAt.getTime();
      const currentEnd = event.finProgramadoAt.getTime();

      for (const item of existingAssignments) {
        const other = item.evento;
        if (!other) continue;
        if (other.estadoEvento === "CANCELADO") continue;

        const otherStart = other.inicioProgramadoAt.getTime();
        const otherEnd = other.finProgramadoAt.getTime();

        const hasConflict =
          currentStart < otherEnd + bufferMs &&
          currentEnd > otherStart - bufferMs;

        if (hasConflict) {
          throw new Error(
            "No se puede asignar: la persona ya tiene otra reunion en ese horario o dentro del margen minimo de 30 minutos."
          );
        }
      }

      await tx.asignacionAsistente.updateMany({
        where: {
          eventoZoomId: eventoId,
          tipoAsignacion: "PRINCIPAL",
          estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
        },
        data: {
          estadoAsignacion: "REASIGNADO"
        }
      });

      const assignment = await tx.asignacionAsistente.create({
        data: {
          eventoZoomId: eventoId,
          asistenteZoomId: input.asistenteZoomId,
          asignadoPorUsuarioId: admin.id,
          motivoAsignacion: input.motivoAsignacion,
          modalidadSnapshot: event.modalidadReunion,
          tarifaAplicadaHora: new Prisma.Decimal(hourlyRate),
          moneda: rate.moneda,
          montoEstimado: calculateEstimatedCost(minutes, hourlyRate)
        }
      });

      await tx.eventoZoom.update({
        where: { id: eventoId },
        data: {
          estadoCobertura: EstadoCoberturaSoporte.ASIGNADO
        }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "ASIGNACION_ASISTENTE_CREADA",
          entidadTipo: "EventoZoom",
          entidadId: eventoId,
          valorNuevo: {
            asignacionId: assignment.id,
            asistenteZoomId: input.asistenteZoomId
          }
        }
      });

      return assignment;
    });

    await notifyAdminTelegramMovement({
      action: "ASIGNACION_ASISTENTE_CREADA",
      actorEmail: admin.email,
      actorRole: admin.role,
      entityType: "EventoZoom",
      entityId: eventoId,
      summary: `asignacion=${assignment.id}`,
      details: {
        asistenteZoomId: input.asistenteZoomId,
        modalidadReunion: event.modalidadReunion
      }
    });

    const docenteUser = event.solicitud.docente?.usuario ?? null;
    const docenteEmail = (docenteUser?.email ?? "").trim().toLowerCase();
    const resolvedResponsableEmail = await resolveResponsibleNotificationEmail(
      event.solicitud.responsableNombre
    );
    const responsableEmail = resolvedResponsableEmail ?? (EMAIL_LINE_REGEX.test(docenteEmail) ? docenteEmail : null);
    const assistantName = getUserDisplayName(selectedAssistant.usuario);

    await sendDefinitiveAssignmentEmails({
      solicitudId: event.solicitud.id,
      eventoId: event.id,
      titulo: event.solicitud.titulo,
      programaNombre: event.solicitud.programaNombre ?? null,
      modalidad: event.modalidadReunion,
      inicio: event.inicioProgramadoAt,
      fin: event.finProgramadoAt,
      timezone: event.timezone || "America/Montevideo",
      joinUrl: event.zoomJoinUrl,
      asistenteNombre: assistantName,
      asistenteEmail: selectedAssistant.usuario.email,
      responsableEmail
    }).catch((error) => {
      logger.warn("No se pudo enviar correo de asignacion definitiva.", {
        eventoId,
        solicitudId: event.solicitud.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });

    return assignment;
  }

  async registerPastMeeting(admin: SessionUser, input: {
    docenteEmail: string;
    responsableEmail: string;
    monitorEmail: string;
    zoomMeetingId?: string;
    titulo: string;
    modalidadReunion: ModalidadReunion;
    inicioRealAt: string;
    finRealAt: string;
    timezone?: string;
    programaNombre?: string;
    descripcion?: string;
    zoomJoinUrl?: string;
  }) {
    const docenteEmail = input.docenteEmail.trim().toLowerCase();
    if (!docenteEmail) {
      throw new Error("docenteEmail es requerido.");
    }

    const responsableEmail = input.responsableEmail.trim().toLowerCase();
    if (!responsableEmail) {
      throw new Error("responsableEmail es requerido.");
    }

    const monitorEmail = input.monitorEmail.trim().toLowerCase();
    if (!monitorEmail) {
      throw new Error("monitorEmail es requerido.");
    }

    const start = toDate(input.inicioRealAt, "inicioRealAt");
    const end = toDate(input.finRealAt, "finRealAt");
    if (end <= start) {
      throw new Error("finRealAt debe ser mayor que inicioRealAt.");
    }
    if (end > new Date()) {
      throw new Error("Solo se pueden registrar reuniones que ya finalizaron.");
    }

    const docenteUser = await db.user.findUnique({
      where: { email: docenteEmail },
      select: { id: true, role: true }
    });
    if (!docenteUser) {
      throw new Error("No existe un usuario docente con ese email.");
    }
    const validDocenteRoles: UserRole[] = [UserRole.DOCENTE, UserRole.ADMINISTRADOR];
    if (!validDocenteRoles.includes(docenteUser.role)) {
      throw new Error("El docente debe tener rol DOCENTE o ADMINISTRADOR.");
    }

    const responsableUser = await db.user.findUnique({
      where: { email: responsableEmail },
      select: { email: true, firstName: true, lastName: true, role: true }
    });
    if (!responsableUser) {
      throw new Error("No existe un usuario responsable con ese email.");
    }
    const validResponsibleRoles: UserRole[] = [UserRole.DOCENTE, UserRole.ADMINISTRADOR];
    if (!validResponsibleRoles.includes(responsableUser.role)) {
      throw new Error("La persona responsable debe tener rol DOCENTE o ADMINISTRADOR.");
    }

    const monitorUser = await db.user.findUnique({
      where: { email: monitorEmail },
      select: { id: true, email: true, role: true }
    });
    if (!monitorUser) {
      throw new Error("No existe un usuario de monitoreo con ese email.");
    }
    const validMonitorRoles: UserRole[] = [
      UserRole.ASISTENTE_ZOOM,
      UserRole.SOPORTE_ZOOM,
      UserRole.ADMINISTRADOR
    ];
    if (!validMonitorRoles.includes(monitorUser.role)) {
      throw new Error("El usuario de monitoreo debe tener rol ASISTENTE_ZOOM, SOPORTE_ZOOM o ADMINISTRADOR.");
    }

    const account = await getOrCreateCuentaZoomDefault();
    if (!account) {
      throw new Error("No hay cuenta Zoom activa para registrar la reunion.");
    }

    const rate = await getActiveRate(input.modalidadReunion);
    if (!rate) {
      throw new Error("No hay tarifa activa para registrar pagos de monitoreo.");
    }

    const meetingIdFromLink = extractZoomMeetingIdFromJoinUrl(input.zoomJoinUrl);
    const normalizedMeetingId =
      normalizeZoomMeetingId(input.zoomMeetingId) ??
      meetingIdFromLink;
    if (!normalizedMeetingId) {
      throw new Error("Debes indicar un Zoom Meeting ID valido (o un link que lo contenga).");
    }

    const existingEvent = await db.eventoZoom.findUnique({
      where: { zoomMeetingId: normalizedMeetingId },
      select: { id: true }
    });
    if (existingEvent) {
      throw new Error("Ese Zoom Meeting ID ya esta asociado a una reunion registrada.");
    }

    const minutes = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const hourlyRate = rate ? Number(rate.valorHora) : 0;
    const amount = calculateEstimatedCost(minutes, hourlyRate);
    const meetingId = normalizedMeetingId;
    const timezone = input.timezone ?? "America/Montevideo";
    const joinUrl = buildZoomJoinUrlFromMeetingId(meetingId);
    const responsableNombre =
      [responsableUser.firstName, responsableUser.lastName].filter(Boolean).join(" ").trim() ||
      responsableUser.email;
    let zoomPastMeetingId: string | null = null;
    let zoomPastParticipantsCount: number | null = null;
    let zoomPastInstancesCount: number | null = null;
    let zoomPastQaCount: number | null = null;

    try {
      const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
      const [pastMeeting, instances] = await Promise.all([
        zoomClient.getPastMeeting(meetingId),
        zoomClient.listPastMeetingInstances(meetingId)
      ]);

      const pastInstances = instances && Array.isArray(instances.meetings)
        ? instances.meetings
        : [];
      const hasPastEvidence = Boolean(pastMeeting) || pastInstances.length > 0;
      if (!hasPastEvidence) {
        throw new Error("El Zoom Meeting ID indicado no tiene instancias pasadas en Zoom.");
      }

      if (pastMeeting) {
        const rawId = pastMeeting.id;
        zoomPastMeetingId = rawId == null ? null : String(rawId);
      }

      zoomPastInstancesCount = pastInstances.length > 0 ? pastInstances.length : (pastMeeting ? 1 : null);

      const [participantsResult, qaResult] = await Promise.allSettled([
        zoomClient.getPastMeetingParticipants(meetingId, { page_size: 300 }),
        zoomClient.listPastMeetingQa(meetingId)
      ]);

      const participants = participantsResult.status === "fulfilled"
        ? participantsResult.value
        : null;
      const qa = qaResult.status === "fulfilled"
        ? qaResult.value
        : null;

      if (participants) {
        const totalRecords = participants.total_records;
        if (typeof totalRecords === "number" && Number.isFinite(totalRecords)) {
          zoomPastParticipantsCount = totalRecords;
        } else if (Array.isArray(participants.participants)) {
          zoomPastParticipantsCount = participants.participants.length;
        }
      }

      if (qa && Array.isArray(qa.questions)) {
        zoomPastQaCount = qa.questions.length;
      }
    } catch (error) {
      if (error instanceof ZoomApiError) {
        throw new Error(`No se pudo validar el Zoom Meeting ID en Zoom: ${error.message}`);
      }
      throw new Error(
        error instanceof Error
          ? error.message
          : "No se pudo validar el Zoom Meeting ID indicado."
      );
    }

    const result = await db.$transaction(async (tx) => {
      const docente = await tx.docente.upsert({
        where: { usuarioId: docenteUser.id },
        create: { usuarioId: docenteUser.id },
        update: {}
      });

      const solicitud = await tx.solicitudSala.create({
        data: {
          docenteId: docente.id,
          createdByUserId: admin.id,
          cuentaZoomAsignadaId: account.id,
          titulo: input.titulo,
          responsableNombre,
          programaNombre: input.programaNombre,
          descripcion: input.descripcion ?? "Registro administrativo de reunion ya ejecutada.",
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: TipoInstancias.UNICA,
          meetingIdEstrategia: MeetingIdEstrategia.UNICO_PREFERIDO,
          meetingPrincipalId: meetingId,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone,
          requiereAsistencia: true,
          motivoAsistencia: "Registro manual para pago de monitoreo.",
          estadoSolicitud: EstadoSolicitudSala.PROVISIONADA
        }
      });

      const event = await tx.eventoZoom.create({
        data: {
          solicitudSalaId: solicitud.id,
          cuentaZoomId: account.id,
          tipoEvento: TipoEventoZoom.SINGLE,
          modalidadReunion: input.modalidadReunion,
          inicioProgramadoAt: start,
          finProgramadoAt: end,
          timezone,
          requiereAsistencia: true,
          estadoCobertura: EstadoCoberturaSoporte.CONFIRMADO,
          estadoEvento: "FINALIZADO",
          estadoEjecucion: "EJECUTADO",
          zoomMeetingId: meetingId,
          zoomJoinUrl: joinUrl,
          sincronizadoConZoomAt: new Date(),
          inicioRealAt: start,
          finRealAt: end,
          minutosReales: minutes,
          costoEstimado: amount,
          costoReal: amount
        }
      });

      const assistant = await tx.asistenteZoom.upsert({
        where: { usuarioId: monitorUser.id },
        create: { usuarioId: monitorUser.id },
        update: {}
      });

      const assignment = await tx.asignacionAsistente.create({
        data: {
          eventoZoomId: event.id,
          asistenteZoomId: assistant.id,
          tipoAsignacion: "PRINCIPAL",
          estadoAsignacion: "ACEPTADO",
          asignadoPorUsuarioId: admin.id,
          motivoAsignacion: "Registro manual de reunion ya ejecutada.",
          fechaRespuestaAt: new Date(),
          modalidadSnapshot: input.modalidadReunion,
          tarifaAplicadaHora: rate.valorHora,
          moneda: rate.moneda,
          montoEstimado: amount,
          montoConfirmado: amount
        },
        select: { id: true }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "REGISTRO_MANUAL_REUNION_PASADA",
          entidadTipo: "EventoZoom",
          entidadId: event.id,
          valorNuevo: {
            solicitudId: solicitud.id,
            eventoId: event.id,
            asignacionId: assignment.id,
            docenteEmail,
            responsableEmail,
            monitorEmail,
            zoomPastMeetingId,
            zoomPastParticipantsCount,
            zoomPastInstancesCount,
            zoomPastQaCount
          }
        }
      });

      return {
        solicitudId: solicitud.id,
        eventoId: event.id,
        asignacionId: assignment.id
      };
    });

    await notifyAdminTelegramMovement({
      action: "REGISTRO_MANUAL_REUNION_PASADA",
      actorEmail: admin.email,
      actorRole: admin.role,
      entityType: "EventoZoom",
      entityId: result.eventoId,
      summary: input.titulo,
      details: {
        docenteEmail,
        responsableEmail,
        monitorEmail,
        modalidadReunion: input.modalidadReunion
      }
    });

    return result;
  }

  async listTarifas() {
    const activeRates = await db.tarifaAsistenciaGlobal.findMany({
      where: { estado: EstadoTarifa.ACTIVA },
      orderBy: [{ modalidadReunion: "asc" }, { vigenteDesde: "desc" }]
    });

    const uniqueByModalidad = new Map<ModalidadReunion, (typeof activeRates)[number]>();
    for (const rate of activeRates) {
      if (!uniqueByModalidad.has(rate.modalidadReunion)) {
        uniqueByModalidad.set(rate.modalidadReunion, rate);
      }
    }

    return Array.from(uniqueByModalidad.values());
  }

  async listPersonMeetingHours(input: { userId?: string | null }) {
    const peopleRows = await db.user.findMany({
      where: {
        role: { in: [UserRole.ASISTENTE_ZOOM, UserRole.SOPORTE_ZOOM, UserRole.ADMINISTRADOR] }
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        firstName: true,
        lastName: true,
        asistenteProfile: {
          select: { id: true }
        }
      },
      orderBy: [{ email: "asc" }]
    });

    const people = peopleRows.map((user) => ({
      userId: user.id,
      email: user.email,
      role: user.role,
      nombre: getUserDisplayName(user),
      hasAssistantProfile: Boolean(user.asistenteProfile?.id)
    }));

    const requestedUserId = (input.userId ?? "").trim();
    const selectedUserId = people.some((item) => item.userId === requestedUserId)
      ? requestedUserId
      : (people[0]?.userId ?? null);
    const selectedPerson = selectedUserId
      ? people.find((item) => item.userId === selectedUserId) ?? null
      : null;

    if (!selectedUserId || !selectedPerson?.hasAssistantProfile) {
      return {
        people,
        selectedUserId,
        selectedPerson,
        totals: {
          meetingsTotal: 0,
          completedMeetingsTotal: 0,
          completedMinutesTotal: 0,
          completedHoursTotal: 0
        },
        monthSummaries: [] as Array<{
          monthKey: string;
          year: number;
          month: number;
          meetingsCount: number;
          totalMinutes: number;
          totalHours: number;
        }>,
        meetings: [] as Array<{
          assignmentId: string;
          eventId: string;
          solicitudId: string;
          titulo: string;
          programaNombre: string | null;
          modalidadReunion: ModalidadReunion;
          inicioAt: string;
          finAt: string;
          minutos: number;
          estadoEvento: EstadoEventoZoom;
          estadoEjecucion: EstadoEjecucionEvento;
          estadoAsignacion: string;
          zoomMeetingId: string | null;
          zoomJoinUrl: string | null;
          isCompleted: boolean;
        }>
      };
    }

    const assignments = await db.asignacionAsistente.findMany({
      where: {
        tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
        estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] },
        asistente: { usuarioId: selectedUserId }
      },
      select: {
        id: true,
        estadoAsignacion: true,
        evento: {
          select: {
            id: true,
            solicitudSalaId: true,
            modalidadReunion: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            inicioRealAt: true,
            finRealAt: true,
            minutosReales: true,
            estadoEvento: true,
            estadoEjecucion: true,
            timezone: true,
            zoomMeetingId: true,
            zoomJoinUrl: true,
            solicitud: {
              select: {
                titulo: true,
                programaNombre: true
              }
            }
          }
        }
      },
      orderBy: {
        evento: {
          inicioProgramadoAt: "desc"
        }
      }
    });

    const now = new Date();
    const meetings = assignments.map((assignment) => {
      const event = assignment.evento;
      const start = event.inicioRealAt ?? event.inicioProgramadoAt;
      const end = event.finRealAt ?? event.finProgramadoAt;
      const durationMinutes =
        event.minutosReales ??
        Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));

      const isCompleted =
        event.estadoEjecucion === EstadoEjecucionEvento.EJECUTADO ||
        (
          end <= now &&
          event.estadoEvento !== EstadoEventoZoom.CANCELADO &&
          event.estadoEjecucion !== EstadoEjecucionEvento.NO_REALIZADO
        );

      return {
        assignmentId: assignment.id,
        eventId: event.id,
        solicitudId: event.solicitudSalaId,
        titulo: event.solicitud.titulo,
        programaNombre: event.solicitud.programaNombre ?? null,
        modalidadReunion: event.modalidadReunion,
        inicioAt: start.toISOString(),
        finAt: end.toISOString(),
        minutos: durationMinutes,
        estadoEvento: event.estadoEvento,
        estadoEjecucion: event.estadoEjecucion,
        estadoAsignacion: assignment.estadoAsignacion,
        zoomMeetingId: event.zoomMeetingId,
        zoomJoinUrl: event.zoomJoinUrl,
        isCompleted,
        timezone: event.timezone || "America/Montevideo"
      };
    });

    const completedMeetings = meetings.filter((meeting) => meeting.isCompleted);
    const monthAccumulator = new Map<string, {
      monthKey: string;
      year: number;
      month: number;
      meetingsCount: number;
      totalMinutes: number;
    }>();

    for (const meeting of completedMeetings) {
      const monthKey = toMonthKey(new Date(meeting.inicioAt), meeting.timezone);
      const [yearRaw = "0", monthRaw = "0"] = monthKey.split("-");
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const current = monthAccumulator.get(monthKey) ?? {
        monthKey,
        year,
        month,
        meetingsCount: 0,
        totalMinutes: 0
      };
      current.meetingsCount += 1;
      current.totalMinutes += meeting.minutos;
      monthAccumulator.set(monthKey, current);
    }

    const monthSummaries = Array.from(monthAccumulator.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((item) => ({
        ...item,
        totalHours: Math.round((item.totalMinutes / 60) * 100) / 100
      }));

    const completedMinutesTotal = completedMeetings.reduce((acc, meeting) => acc + meeting.minutos, 0);

    return {
      people,
      selectedUserId,
      selectedPerson,
      totals: {
        meetingsTotal: meetings.length,
        completedMeetingsTotal: completedMeetings.length,
        completedMinutesTotal,
        completedHoursTotal: Math.round((completedMinutesTotal / 60) * 100) / 100
      },
      monthSummaries,
      meetings: meetings.map(({ timezone: _timezone, ...meeting }) => meeting)
    };
  }

  async createTarifa(user: SessionUser, input: {
    modalidadReunion: ModalidadReunion;
    valorHora: number;
    moneda: string;
    vigenteDesde?: string;
  }) {
    if (input.valorHora < 0) {
      throw new Error("valorHora debe ser mayor o igual a 0.");
    }

    const start = input.vigenteDesde ? toDate(input.vigenteDesde, "vigenteDesde") : new Date();

    const created = await db.$transaction(async (tx) => {
      const activeRates = await tx.tarifaAsistenciaGlobal.findMany({
        where: {
          modalidadReunion: input.modalidadReunion,
          estado: EstadoTarifa.ACTIVA
        },
        orderBy: { vigenteDesde: "desc" }
      });

      const currentActive = activeRates[0] ?? null;
      if (currentActive && activeRates.length > 1) {
        await tx.tarifaAsistenciaGlobal.updateMany({
          where: {
            modalidadReunion: input.modalidadReunion,
            estado: EstadoTarifa.ACTIVA,
            id: { not: currentActive.id }
          },
          data: {
            estado: EstadoTarifa.INACTIVA,
            vigenteHasta: start
          }
        });
      }

      const created = currentActive
        ? await tx.tarifaAsistenciaGlobal.update({
            where: { id: currentActive.id },
            data: {
              valorHora: new Prisma.Decimal(input.valorHora),
              moneda: input.moneda,
              vigenteDesde: start,
              vigenteHasta: null,
              aprobadoPorUsuarioId: user.id
            }
          })
        : await tx.tarifaAsistenciaGlobal.create({
            data: {
              modalidadReunion: input.modalidadReunion,
              valorHora: new Prisma.Decimal(input.valorHora),
              moneda: input.moneda,
              vigenteDesde: start,
              creadoPorUsuarioId: user.id,
              aprobadoPorUsuarioId: user.id
            }
          });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "TARIFA_MODALIDAD_ACTUALIZADA",
          entidadTipo: "TarifaAsistenciaGlobal",
          entidadId: created.id,
          valorNuevo: {
            modalidadReunion: input.modalidadReunion,
            valorHora: input.valorHora,
            moneda: input.moneda
          }
        }
      });

      return created;
    });

    await notifyAdminTelegramMovement({
      action: "TARIFA_MODALIDAD_ACTUALIZADA",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "TarifaAsistenciaGlobal",
      entityId: created.id,
      summary: `${input.modalidadReunion} ${input.valorHora} ${input.moneda}`,
      details: {
        modalidadReunion: input.modalidadReunion,
        valorHora: input.valorHora,
        moneda: input.moneda
      }
    });

    return created;
  }
}

