import { EstadoEnvioNotificacion, TipoNotificacion, UserRole } from "@prisma/client";
import { db } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";

type AdminNotificationInput = {
  action: string;
  actorEmail?: string;
  actorFirstName?: string | null;
  actorLastName?: string | null;
  actorRole?: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  details?: Record<string, unknown>;
  occurredAt?: Date;
};

const DETAIL_PRIORITY: string[] = [
  "titulo",
  "solicitudId",
  "eventoId",
  "meetingId",
  "zoomMeetingId",
  "zoomAccount",
  "responsableNombre",
  "modalidadReunion",
  "requiereAsistencia",
  "toEmail",
  "updatedEvents",
  "cancelledAssignments"
];

function normalizeActionLabel(action: string): string {
  if (!action) return "SIN_ACCION";
  return action
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDetailKey(key: string): string {
  if (!key) return "dato";
  const humanized = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return humanized[0]?.toUpperCase() + humanized.slice(1);
}

function stringifyDetailValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "0";
    if (value.length <= 3) return value.map((item) => String(item)).join(", ");
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    const asRecord = value as Record<string, unknown>;
    const keys = Object.keys(asRecord);
    if (keys.length === 0) return "objeto vacio";
    return `objeto (${keys.length} claves)`;
  }
  return String(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatDateTime(value: Date): string {
  try {
    return new Intl.DateTimeFormat("es-UY", {
      timeZone: env.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

function formatDetails(details?: Record<string, unknown>): string[] {
  if (!details) return [];
  const entries = Object.entries(details).filter(([_key, value]) => value !== undefined && value !== null);
  entries.sort((left, right) => {
    const leftPriority = DETAIL_PRIORITY.indexOf(left[0]);
    const rightPriority = DETAIL_PRIORITY.indexOf(right[0]);
    const normalizedLeft = leftPriority >= 0 ? leftPriority : Number.POSITIVE_INFINITY;
    const normalizedRight = rightPriority >= 0 ? rightPriority : Number.POSITIVE_INFINITY;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return left[0].localeCompare(right[0]);
  });

  return entries.slice(0, 8).map(([key, value]) => {
    return `- ${normalizeDetailKey(key)}: ${truncate(stringifyDetailValue(value), 200)}`;
  });
}

function buildNotificationBody(input: AdminNotificationInput): string {
  const occurredAt = input.occurredAt ?? new Date();
  const lines: string[] = [];

  lines.push(`Accion: ${normalizeActionLabel(input.action)}`);
  if (input.summary?.trim()) {
    lines.push(`Resumen: ${input.summary.trim()}`);
  }
  lines.push(`Fecha: ${formatDateTime(occurredAt)} (${occurredAt.toISOString()})`);

  const actorName = [input.actorFirstName, input.actorLastName].filter(Boolean).join(" ").trim();
  if (actorName && input.actorEmail?.trim()) {
    lines.push(`Actor: ${actorName} (${input.actorEmail.trim()})`);
  } else if (actorName) {
    lines.push(`Actor: ${actorName}`);
  } else if (input.actorEmail?.trim()) {
    lines.push(`Actor: ${input.actorEmail.trim()}`);
  }

  if (input.actorRole?.trim()) lines.push(`Rol actor: ${input.actorRole.trim()}`);
  if (input.entityType?.trim() || input.entityId?.trim()) {
    lines.push(`Entidad: ${(input.entityType ?? "-").trim() || "-"} / ${(input.entityId ?? "-").trim() || "-"}`);
  }

  const detailLines = formatDetails(input.details);
  if (detailLines.length > 0) {
    lines.push("Datos clave:");
    lines.push(...detailLines);
  }

  return lines.join("\n");
}

export async function notifyAdminInAppMovement(input: AdminNotificationInput): Promise<void> {
  try {
    const admins = await db.user.findMany({
      where: { role: UserRole.ADMINISTRADOR },
      select: { id: true, email: true }
    });
    if (admins.length === 0) return;

    const subjectBase = normalizeActionLabel(input.action);
    const summarySuffix = input.summary?.trim() ? ` | ${truncate(input.summary.trim(), 120)}` : "";
    const subject = `${subjectBase}${summarySuffix}`;
    const now = input.occurredAt ?? new Date();
    const body = buildNotificationBody(input);

    await db.notificacion.createMany({
      data: admins.map((admin) => ({
        usuarioId: admin.id,
        tipoNotificacion: TipoNotificacion.ALERTA_OPERATIVA,
        canalDestino: "IN_APP",
        asunto: subject,
        cuerpo: body,
        estadoEnvio: EstadoEnvioNotificacion.ENVIADA,
        intentoCount: 1,
        ultimoIntentoAt: now,
        entidadReferenciaTipo: input.entityType?.trim() || "SISTEMA",
        entidadReferenciaId: input.entityId?.trim() || null
      }))
    });
  } catch (error) {
    logger.warn("No se pudo registrar una notificacion interna para administradores.", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
