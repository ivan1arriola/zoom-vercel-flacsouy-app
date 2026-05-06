import { EstadoEnvioNotificacion, TipoNotificacion, UserRole } from "@prisma/client";
import { db } from "@/src/lib/db";
import {
  NOTIF_ACTIVITY_LOGIN,
  NOTIF_ACTIVITY_ZOOM_RECORDING_WEBHOOK
} from "@/src/lib/notification-activity";

type LoginNotificationInput = {
  userId: string;
  userEmail: string;
  userName?: string | null;
  provider?: string | null;
  connectedAt?: Date;
  userAgent?: string | null;
  ip?: string | null;
};

type ZoomRecordingNotificationInput = {
  eventName: string;
  eventTs?: number | null;
  accountId?: string | null;
  meetingId?: string | null;
  meetingUuid?: string | null;
  topic?: string | null;
  autoSyncEnabled?: boolean;
};

type DeviceContext = {
  deviceType: string | null;
  os: string | null;
  browser: string | null;
};

function normalizeOptional(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function detectOperatingSystem(userAgent: string): string | null {
  if (/windows/i.test(userAgent)) return "Windows";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  if (/macintosh|mac os x/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return null;
}

function detectBrowser(userAgent: string): string | null {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\//i.test(userAgent)) return "Opera";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent) && !/chrome|crios/i.test(userAgent)) return "Safari";
  return null;
}

function detectDeviceType(userAgent: string): string | null {
  if (/ipad|tablet/i.test(userAgent)) return "Tablet";
  if (/mobi|iphone|ipod|android.+mobile/i.test(userAgent)) return "Movil";
  if (userAgent.length > 0) return "Escritorio";
  return null;
}

function inferDeviceContext(userAgentRaw: string | null | undefined): DeviceContext {
  const userAgent = normalizeOptional(userAgentRaw)?.toLowerCase() ?? "";
  if (!userAgent) {
    return {
      deviceType: null,
      os: null,
      browser: null
    };
  }
  return {
    deviceType: detectDeviceType(userAgent),
    os: detectOperatingSystem(userAgent),
    browser: detectBrowser(userAgent)
  };
}

function resolveDisplayName(email: string, name?: string | null): string {
  const candidate = normalizeOptional(name);
  return candidate ?? email;
}

function formatEventTime(value?: number | null): string | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;

  const asNumber = Number(value);
  const asMs = asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000;
  const date = new Date(asMs);
  if (Number.isNaN(date.getTime())) return null;

  const local = new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Montevideo"
  }).format(date);
  return `${local} (${date.toISOString()})`;
}

function buildLoginBody({
  userEmail,
  userName,
  provider,
  connectedAt,
  userAgent,
  ip
}: Omit<LoginNotificationInput, "userId">): string {
  const loginAt = connectedAt ?? new Date();
  const loginAtIso = loginAt.toISOString();
  const loginAtUy = new Intl.DateTimeFormat("es-UY", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "America/Montevideo"
  }).format(loginAt);

  const deviceContext = inferDeviceContext(userAgent);
  const providerLabel = normalizeOptional(provider) ?? "No disponible";
  const ipLabel = normalizeOptional(ip) ?? "No disponible";
  const uaLabel = normalizeOptional(userAgent) ?? "No disponible";
  const deviceLabel =
    [deviceContext.deviceType, deviceContext.os, deviceContext.browser]
      .filter(Boolean)
      .join(" · ") || "No disponible";
  const displayName = resolveDisplayName(userEmail, userName);

  return [
    "Se registro un inicio de sesion.",
    `Usuario: ${displayName} (${userEmail})`,
    `Fecha y hora: ${loginAtUy} (${loginAtIso})`,
    `Dispositivo: ${deviceLabel}`,
    `Proveedor: ${providerLabel}`,
    `IP: ${ipLabel}`,
    `User-Agent: ${uaLabel}`
  ].join("\n");
}

function buildZoomRecordingBody(input: ZoomRecordingNotificationInput): string {
  const lines: string[] = ["Se recibio un evento de grabacion desde Zoom."];

  const eventName = normalizeOptional(input.eventName);
  const accountId = normalizeOptional(input.accountId ?? undefined);
  const meetingId = normalizeOptional(input.meetingId ?? undefined);
  const meetingUuid = normalizeOptional(input.meetingUuid ?? undefined);
  const topic = normalizeOptional(input.topic ?? undefined);
  const occurredAt = formatEventTime(input.eventTs);

  if (eventName) lines.push(`Evento: ${eventName}`);
  if (topic) lines.push(`Reunion: ${topic}`);
  if (meetingId) lines.push(`Meeting ID: ${meetingId}`);
  if (meetingUuid) lines.push(`Meeting UUID: ${meetingUuid}`);
  if (accountId) lines.push(`Cuenta Zoom: ${accountId}`);
  if (occurredAt) lines.push(`Fecha del evento: ${occurredAt}`);
  lines.push(`Auto-sync Drive: ${input.autoSyncEnabled ? "Activo" : "Inactivo"}`);

  return lines.join("\n");
}

export async function createAdminLoginNotifications(input: LoginNotificationInput): Promise<number> {
  const userEmail = normalizeOptional(input.userEmail)?.toLowerCase();
  if (!userEmail) return 0;

  const admins = await db.user.findMany({
    where: { role: UserRole.ADMINISTRADOR },
    select: {
      id: true
    }
  });
  if (admins.length === 0) return 0;

  const connectedAt = input.connectedAt ?? new Date();
  const subject = `Inicio de sesion: ${resolveDisplayName(userEmail, input.userName)}`;
  const body = buildLoginBody({
    userEmail,
    userName: input.userName,
    provider: input.provider,
    connectedAt,
    userAgent: input.userAgent,
    ip: input.ip
  });

  const result = await db.notificacion.createMany({
    data: admins.map((admin) => ({
      usuarioId: admin.id,
      tipoNotificacion: TipoNotificacion.IN_APP,
      canalDestino: "IN_APP",
      asunto: subject,
      cuerpo: body,
      estadoEnvio: EstadoEnvioNotificacion.ENVIADA,
      intentoCount: 1,
      ultimoIntentoAt: connectedAt,
      entidadReferenciaTipo: NOTIF_ACTIVITY_LOGIN,
      entidadReferenciaId: input.userId
    }))
  });

  return result.count;
}

export async function createAdminZoomRecordingNotifications(
  input: ZoomRecordingNotificationInput
): Promise<number> {
  const eventName = normalizeOptional(input.eventName);
  if (!eventName) return 0;

  const admins = await db.user.findMany({
    where: { role: UserRole.ADMINISTRADOR },
    select: {
      id: true
    }
  });
  if (admins.length === 0) return 0;

  const now = new Date();
  const subject = `Zoom Recording: ${eventName}`;
  const body = buildZoomRecordingBody(input);
  const entityReferenceId =
    normalizeOptional(input.meetingId ?? undefined) ||
    normalizeOptional(input.meetingUuid ?? undefined) ||
    normalizeOptional(input.accountId ?? undefined);

  const result = await db.notificacion.createMany({
    data: admins.map((admin) => ({
      usuarioId: admin.id,
      tipoNotificacion: TipoNotificacion.ALERTA_OPERATIVA,
      canalDestino: "IN_APP",
      asunto: subject,
      cuerpo: body,
      estadoEnvio: EstadoEnvioNotificacion.ENVIADA,
      intentoCount: 1,
      ultimoIntentoAt: now,
      entidadReferenciaTipo: NOTIF_ACTIVITY_ZOOM_RECORDING_WEBHOOK,
      entidadReferenciaId: entityReferenceId
    }))
  });

  return result.count;
}
