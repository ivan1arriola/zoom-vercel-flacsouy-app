import {
  CuentaZoom,
  EstadoAsignacion,
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
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { db } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import { EmailClient } from "@/src/lib/email.client";
import { logger } from "@/src/lib/logger";
import { notifyAdminTelegramMovement } from "@/src/lib/telegram.client";
import { ZoomApiError, ZoomMeetingsClient } from "@/src/lib/zoom-meetings.client";
import type { SessionUser } from "@/src/lib/api-auth";

type InstanceDetailInput = {
  inicioProgramadoAt: string;
  finProgramadoAt?: string;
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
  estadoCobertura?: string | null;
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

type SuggestionAssistantNode = {
  id: string;
  email: string;
  nombre: string;
};

type SuggestionEventNode = {
  id: string;
  titulo: string;
  inicioProgramadoAtIso: string;
  finProgramadoAtIso: string;
  inicioProgramadoMs: number;
  finProgramadoMs: number;
  monthKey: string;
  modalidadReunion: ModalidadReunion;
  timezone: string;
  coverageValue: number;
  candidateAssistantIds: string[];
};

type SuggestionLoadsByMonth = Record<string, number[]>;

type SuggestionSearchNode = {
  eventIndex: number;
  loadsByMonth: SuggestionLoadsByMonth;
  assignmentByEvent: Array<string | null>;
  schedulesByAssistant: Record<string, Array<[number, number]>>;
};

type AssignmentSuggestionSessionValue = {
  version: 1;
  sessionId: string;
  createdByUserId: string;
  scopeKey: string;
  createdAtIso: string;
  expiresAtIso: string;
  assistants: SuggestionAssistantNode[];
  events: SuggestionEventNode[];
  baseLoadsByMonth: SuggestionLoadsByMonth;
  targetScore: number | null;
  returnedSignatures: string[];
  frontier: SuggestionSearchNode[];
};

type AssignmentSuggestionResult = {
  sessionId: string;
  scopeKey: string;
  score: number;
  events: Array<{
    eventoId: string;
    titulo: string;
    inicioProgramadoAt: string;
    finProgramadoAt: string;
    modalidadReunion: ModalidadReunion;
    coverageValue: number;
    asistenteZoomId: string;
    asistenteNombre: string;
    asistenteEmail: string;
  }>;
  assistants: Array<{
    asistenteZoomId: string;
    asistenteNombre: string;
    asistenteEmail: string;
    baseValue: number;
    suggestedValue: number;
    projectedValue: number;
  }>;
};

const LEGACY_ASSISTANT_ROLES: UserRole[] = [UserRole.ASISTENTE_ZOOM, UserRole.SOPORTE_ZOOM];
const SUGGESTION_SESSION_TTL_MS = 30 * 60 * 1000;
const SUGGESTION_SESSION_KEY_PREFIX = "assignment_suggestion_session:";
const SUGGESTION_SCORE_EPSILON = 1e-6;
const ASSIGNMENT_CONFLICT_BUFFER_MS = 30 * 60 * 1000;

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

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function detectRecordingFromZoomPayload(
  rawPayload: Prisma.JsonValue | null | undefined
): boolean | null {
  const root = isUnknownRecord(rawPayload) ? rawPayload : null;
  if (!root) return null;

  const hasRecording = root.has_recording;
  if (typeof hasRecording === "boolean") {
    return hasRecording;
  }

  const recordingCount = numberFromUnknown(root.recording_count);
  if (recordingCount !== null) {
    return recordingCount > 0;
  }

  if (Array.isArray(root.recording_files)) {
    return root.recording_files.length > 0;
  }

  const nestedRecording = isUnknownRecord(root.recording) ? root.recording : null;
  if (!nestedRecording) return null;

  if (typeof nestedRecording.has_recording === "boolean") {
    return nestedRecording.has_recording;
  }

  const nestedCount = numberFromUnknown(nestedRecording.recording_count);
  if (nestedCount !== null) {
    return nestedCount > 0;
  }

  if (Array.isArray(nestedRecording.recording_files)) {
    return nestedRecording.recording_files.length > 0;
  }
  if (Array.isArray(nestedRecording.files)) {
    return nestedRecording.files.length > 0;
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

function toDayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function isSameCalendarDayInTimezone(start: Date, end: Date, timezone: string): boolean {
  return toDayKey(start, timezone) === toDayKey(end, timezone);
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

function normalizeZoomHostAccountLabel(value?: string | null): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  const lowered = normalized.toLowerCase();
  if (lowered.includes("flacso.local")) return null;
  return normalized;
}

function pickZoomHostAccountLabel(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeZoomHostAccountLabel(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function calculateEstimatedCost(minutes: number, rate: number): Prisma.Decimal {
  return new Prisma.Decimal((minutes / 60) * rate);
}

function suggestionSessionKey(sessionId: string): string {
  return `${SUGGESTION_SESSION_KEY_PREFIX}${sessionId}`;
}

function parseMonthKeyOrThrow(monthKey?: string | null): string {
  const raw = (monthKey ?? "").trim();
  if (!raw) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    throw new Error("El parámetro month debe tener formato YYYY-MM.");
  }
  return raw;
}

function getMonthUtcRange(monthKey: string): { start: Date; endExclusive: Date } {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

function computeCoverageValue(input: {
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  tarifaHora: number;
}): number {
  const durationMinutes = Math.max(
    1,
    Math.floor((input.finProgramadoAt.getTime() - input.inicioProgramadoAt.getTime()) / 60000)
  );
  return (durationMinutes / 60) * input.tarifaHora;
}

function hasScheduleConflict(
  schedulesByAssistant: Record<string, Array<[number, number]>>,
  assistantId: string,
  startMs: number,
  endMs: number,
  bufferMs = ASSIGNMENT_CONFLICT_BUFFER_MS
): boolean {
  const schedule = schedulesByAssistant[assistantId] ?? [];
  for (const [otherStart, otherEnd] of schedule) {
    const hasConflict = startMs < otherEnd + bufferMs && endMs > otherStart - bufferMs;
    if (hasConflict) return true;
  }
  return false;
}

function computeSuggestionScore(loads: number[]): number {
  if (loads.length === 0) return 0;
  const total = loads.reduce((sum, value) => sum + value, 0);
  const avg = total / loads.length;
  const min = Math.min(...loads);
  const max = Math.max(...loads);
  const varianceSum = loads.reduce((sum, value) => {
    const delta = value - avg;
    return sum + delta * delta;
  }, 0);
  return (max - min) * 1000 + varianceSum;
}

function cloneLoadsByMonth(loadsByMonth: SuggestionLoadsByMonth): SuggestionLoadsByMonth {
  const clone: SuggestionLoadsByMonth = {};
  for (const [key, value] of Object.entries(loadsByMonth)) {
    clone[key] = [...value];
  }
  return clone;
}

function computeSuggestionScoreByMonth(loadsByMonth: SuggestionLoadsByMonth): number {
  return Object.values(loadsByMonth).reduce(
    (sum, loads) => sum + computeSuggestionScore(loads),
    0
  );
}

function buildSuggestionSignature(assignmentByEvent: Array<string | null>): string {
  return assignmentByEvent.map((value) => value ?? "-").join("|");
}

async function loadSuggestionSession(sessionId: string): Promise<AssignmentSuggestionSessionValue | null> {
  const setting = await db.appSetting.findUnique({ where: { key: suggestionSessionKey(sessionId) } });
  if (!setting?.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
    return null;
  }

  const payload = setting.value as unknown as AssignmentSuggestionSessionValue;
  if (!payload || payload.version !== 1 || payload.sessionId !== sessionId) {
    return null;
  }

  const expiresAt = new Date(payload.expiresAtIso);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    await db.appSetting.delete({ where: { key: suggestionSessionKey(sessionId) } }).catch(() => null);
    return null;
  }

  return payload;
}

async function persistSuggestionSession(session: AssignmentSuggestionSessionValue) {
  await db.appSetting.upsert({
    where: { key: suggestionSessionKey(session.sessionId) },
    create: {
      key: suggestionSessionKey(session.sessionId),
      value: session as unknown as Prisma.InputJsonValue
    },
    update: {
      value: session as unknown as Prisma.InputJsonValue
    }
  });
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

async function listUserAccessEmails(userId: string, fallbackEmail?: string | null): Promise<string[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      emailAliases: {
        select: {
          email: true
        }
      }
    }
  });

  const unique = new Set<string>();
  if (user?.email) {
    unique.add(user.email.trim().toLowerCase());
  }
  for (const alias of user?.emailAliases ?? []) {
    const normalized = alias.email.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  if (unique.size === 0 && fallbackEmail) {
    unique.add(fallbackEmail.trim().toLowerCase());
  }

  return Array.from(unique.values());
}

async function resolveResponsibleNotificationEmail(
  responsableNombre?: string | null
): Promise<string | null> {
  const normalized = (responsableNombre ?? "").trim();
  if (!normalized) return null;

  // Accept formats like "Nombre Apellido (correo@dominio.com)".
  const embeddedEmailMatch = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (embeddedEmailMatch?.[0] && EMAIL_LINE_REGEX.test(embeddedEmailMatch[0])) {
    return embeddedEmailMatch[0].toLowerCase();
  }

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

function getSolicitudStatusLabel(status: EstadoSolicitudSala | "PENDIENTE_ASISTENCIA_ZOOM"): string {
  switch (status) {
    case "PENDIENTE_ASISTENCIA_ZOOM":
      return "PENDIENTE_ASISTENCIA_ZOOM";
    case EstadoSolicitudSala.PROVISIONADA:
      return "LISTO";
    case EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID:
      return "Pendiente manual";
    case EstadoSolicitudSala.CANCELADA_DOCENTE:
    case EstadoSolicitudSala.CANCELADA_ADMIN:
      return "Cancelada";
    default:
      return status;
  }
}

function resolveOccurrenceEndMs(occurrence: ZoomOccurrenceSnapshot): number | null {
  const parsedEnd = occurrence.endTime ? new Date(occurrence.endTime).getTime() : Number.NaN;
  if (Number.isFinite(parsedEnd)) return parsedEnd;

  const parsedStart = new Date(occurrence.startTime).getTime();
  if (!Number.isFinite(parsedStart)) return null;

  const durationMinutes = Number(occurrence.durationMinutes);
  if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
    return parsedStart + durationMinutes * 60_000;
  }

  return parsedStart;
}

function isOccurrenceActiveOrUpcoming(occurrence: ZoomOccurrenceSnapshot, nowMs: number): boolean {
  if (occurrence.estadoEvento === EstadoEventoZoom.CANCELADO || occurrence.status === "deleted") {
    return false;
  }
  if (occurrence.estadoEvento === EstadoEventoZoom.FINALIZADO) {
    return false;
  }

  const endMs = resolveOccurrenceEndMs(occurrence);
  if (endMs === null) return true;
  return endMs >= nowMs;
}

function isPendingAsistenciaOccurrence(occurrence: ZoomOccurrenceSnapshot, nowMs: number): boolean {
  if (!isOccurrenceActiveOrUpcoming(occurrence, nowMs)) return false;
  if (!occurrence.requiereAsistencia) return false;

  const monitorLabel = (occurrence.monitorNombre ?? occurrence.monitorEmail ?? "").trim();
  const coverage = occurrence.estadoCobertura ?? null;

  if (
    coverage === EstadoCoberturaSoporte.CONFIRMADO ||
    coverage === EstadoCoberturaSoporte.ASIGNADO
  ) {
    return false;
  }
  if (coverage === EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR) {
    return true;
  }
  if (coverage === EstadoCoberturaSoporte.NO_REQUIERE || coverage === EstadoCoberturaSoporte.CANCELADO) {
    return false;
  }

  return monitorLabel.length === 0;
}

function resolveSolicitudDisplayStatus(
  estadoSolicitud: EstadoSolicitudSala,
  zoomInstances: ZoomOccurrenceSnapshot[]
): EstadoSolicitudSala | "PENDIENTE_ASISTENCIA_ZOOM" {
  if (estadoSolicitud !== EstadoSolicitudSala.PROVISIONADA) {
    return estadoSolicitud;
  }

  const nowMs = Date.now();
  const hasPendingAsistencia = zoomInstances.some((occurrence) =>
    isPendingAsistenciaOccurrence(occurrence, nowMs)
  );

  return hasPendingAsistencia ? "PENDIENTE_ASISTENCIA_ZOOM" : EstadoSolicitudSala.PROVISIONADA;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type BrandedEmailLayoutInput = {
  preheader: string;
  title: string;
  greeting?: string;
  paragraphs?: string[];
  contentHtml?: string;
  actionLabel?: string;
  actionUrl?: string;
  metaLines?: string[];
  footerLine?: string;
  kicker?: string;
};

function getEmailBaseUrl(): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL;
  return "http://localhost:3000";
}

function buildBrandedEmailLayout(input: BrandedEmailLayoutInput): string {
  const baseUrl = getEmailBaseUrl();
  const brandingBaseUrl = `${baseUrl.replace(/\/$/, "")}/branding`;
  const primaryLogoUrl = `${brandingBaseUrl}/flacso-uruguay-primary-white.png`;
  const secondaryLogoUrl = `${brandingBaseUrl}/flacso-uruguay-secondary-blue.png`;
  const preheader = escapeHtml(input.preheader);
  const title = escapeHtml(input.title);
  const kicker = escapeHtml(input.kicker ?? "Plataforma Zoom de FLACSO Uruguay");
  const greeting = (input.greeting ?? "").trim();
  const greetingHtml = greeting
    ? `<p style="margin:0 0 14px 0;color:#223042;font-size:16px;line-height:1.6;font-weight:700;">${escapeHtml(greeting)}</p>`
    : "";
  const paragraphsHtml = (input.paragraphs ?? [])
    .map((line) => `<p style="margin:0 0 14px 0;color:#223042;font-size:16px;line-height:1.6;">${escapeHtml(line)}</p>`)
    .join("");
  const actionUrl = (input.actionUrl ?? "").trim();
  const actionBlock =
    input.actionLabel && actionUrl
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0 16px 0;">
        <tr>
          <td align="center" style="border-radius:10px;background:#1d3a72;">
            <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 20px;font-weight:700;font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;">${escapeHtml(input.actionLabel)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 14px 0;color:#536074;font-size:13px;line-height:1.5;">Si el boton no funciona, copia y pega este enlace:<br/><a href="${escapeHtml(actionUrl)}" style="color:#1d3a72;word-break:break-all;">${escapeHtml(actionUrl)}</a></p>
    `
      : "";
  const metaBlock =
    input.metaLines && input.metaLines.length > 0
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 0 0;">${input.metaLines
          .map(
            (line) =>
              `<tr><td style="padding:0 8px 8px 0;color:#1d3a72;font-size:14px;">•</td><td style="padding:0 0 8px 0;color:#425066;font-size:14px;line-height:1.5;">${escapeHtml(line)}</td></tr>`
          )
          .join("")}</table>`
      : "";
  const footerLine = escapeHtml(
    input.footerLine ??
      "Este es un mensaje automatico de FLACSO Uruguay. Si no reconoces esta accion, ignora este correo."
  );
  const contentHtml = input.contentHtml ?? "";

  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:20px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;border-collapse:collapse;">
            <tr>
              <td style="border-radius:14px 14px 0 0;padding:20px 24px;background:linear-gradient(135deg,#1d3a72,#254c95);">
                <img src="${escapeHtml(primaryLogoUrl)}" alt="FLACSO Uruguay" style="height:42px;display:block;" />
                <p style="margin:18px 0 6px 0;color:#cfd8ea;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">${kicker}</p>
                <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:800;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:26px 24px;border-left:1px solid #dbe3f0;border-right:1px solid #dbe3f0;">
                ${greetingHtml}
                ${paragraphsHtml}
                ${contentHtml}
                ${actionBlock}
                ${metaBlock}
              </td>
            </tr>
            <tr>
              <td style="background:#eef3fb;padding:16px 24px;border:1px solid #dbe3f0;border-top:0;border-radius:0 0 14px 14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;color:#5c697e;font-size:12px;line-height:1.5;">${footerLine}</p>
                    </td>
                    <td align="right" style="padding-left:12px;vertical-align:middle;">
                      <img src="${escapeHtml(secondaryLogoUrl)}" alt="FLACSO Uruguay" style="height:24px;display:block;" />
                    </td>
                  </tr>
                </table>
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
  const hasManyInstances = instanceStarts.length > 1;
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>ID de reunion:</strong> ${meetingLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Contrasena de la reunion:</strong> ${passwordLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Cuenta anfitriona:</strong> ${hostLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${instanceStarts.length}</p>
    </div>
    <p style="margin:0 0 8px;color:#223042;"><strong>Fechas programadas</strong></p>
    <ol style="margin:0 0 12px;padding-left:20px;color:#223042;">
      ${previewRows}
    </ol>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: hasManyInstances
      ? "Tu serie fue confirmada y ya esta disponible en Zoom."
      : "Tu reunion fue confirmada y ya esta disponible en Zoom.",
    title: "Tu reunion esta lista",
    greeting: "Hola,",
    paragraphs: [
      hasManyInstances
        ? "Tu serie fue confirmada y ya esta disponible en Zoom."
        : "Tu reunion fue confirmada y ya esta disponible en Zoom."
    ],
    contentHtml,
    actionLabel: joinUrl ? "Abrir reunion en Zoom" : undefined,
    actionUrl: joinUrl ?? undefined,
    metaLines: ["Si necesitas cambios, responde a este correo o contacta al equipo de coordinacion."]
  });
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

  // Solo respetar copias explicitas del flujo llamador.
  const ccUnique = Array.from(
    new Set([
      ...input.cc.map((email) => email.trim().toLowerCase())
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

function formatAssistantInterestLabel(estadoInteres: EstadoInteresAsistente): string {
  if (estadoInteres === EstadoInteresAsistente.ME_INTERESA) return "Me postulo";
  if (estadoInteres === EstadoInteresAsistente.RETIRADO) return "No voy a postular";
  return "No voy a postular";
}

function shouldNotifyAdminsForAssistantPreference(estadoInteres: EstadoInteresAsistente): boolean {
  // Reducir ruido: a admins solo llega cuando hay postulacion explicita.
  return estadoInteres === EstadoInteresAsistente.ME_INTERESA;
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
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Responsable:</strong> ${responsableLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Estado:</strong> ${statusLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${input.instanceStarts.length}</p>
    </div>
    <p style="margin:0 0 8px;color:#223042;"><strong>Fechas previstas</strong></p>
    <ol style="margin:0 0 12px;padding-left:20px;color:#223042;">
      ${previewRows}
    </ol>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Se registro una nueva solicitud que requiere asistencia Zoom.",
    title: "Nueva solicitud con monitoreo requerido",
    greeting: "Hola,",
    paragraphs: ["Se registro una nueva solicitud que requiere asistencia Zoom."],
    contentHtml,
    metaLines: ["Revisa la seccion Reuniones disponibles para marcar interes en las instancias abiertas."]
  });
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

type AdminNotificationPriority = "CRITICAL" | "INFO";

type AdminInfoDigestItem = {
  createdAtIso: string;
  subject: string;
  title: string;
  summary: string;
  metaLines: string[];
};

type AdminInfoDigestState = {
  lastSentAtIso?: string;
  items: AdminInfoDigestItem[];
};

const ADMIN_INFO_DIGEST_SETTING_KEY = "admin_email_info_digest_v1";
const ADMIN_INFO_DIGEST_FLUSH_INTERVAL_MS = 45 * 60 * 1000;
const ADMIN_INFO_DIGEST_MAX_ITEMS = 12;

function sanitizeDigestMetaLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeAdminInfoDigestState(raw: unknown): AdminInfoDigestState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { items: [] };
  }

  const state = raw as {
    lastSentAtIso?: unknown;
    items?: unknown;
  };

  const items = Array.isArray(state.items)
    ? state.items
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const candidate = item as {
            createdAtIso?: unknown;
            subject?: unknown;
            title?: unknown;
            summary?: unknown;
            metaLines?: unknown;
          };
          const subject = String(candidate.subject ?? "").trim();
          const title = String(candidate.title ?? "").trim();
          const summary = String(candidate.summary ?? "").trim();
          if (!subject || !title || !summary) return null;
          return {
            createdAtIso: String(candidate.createdAtIso ?? new Date().toISOString()),
            subject,
            title,
            summary,
            metaLines: sanitizeDigestMetaLines(candidate.metaLines)
          } satisfies AdminInfoDigestItem;
        })
        .filter((item): item is AdminInfoDigestItem => Boolean(item))
        .slice(-ADMIN_INFO_DIGEST_MAX_ITEMS)
    : [];

  const lastSentAtIso = String(state.lastSentAtIso ?? "").trim();

  return {
    lastSentAtIso: lastSentAtIso || undefined,
    items
  };
}

async function loadAdminInfoDigestState(): Promise<AdminInfoDigestState> {
  const row = await db.appSetting.findUnique({
    where: { key: ADMIN_INFO_DIGEST_SETTING_KEY },
    select: { value: true }
  });
  return normalizeAdminInfoDigestState(row?.value ?? null);
}

async function saveAdminInfoDigestState(state: AdminInfoDigestState): Promise<void> {
  await db.appSetting.upsert({
    where: { key: ADMIN_INFO_DIGEST_SETTING_KEY },
    update: {
      value: {
        lastSentAtIso: state.lastSentAtIso ?? null,
        items: state.items
      }
    },
    create: {
      key: ADMIN_INFO_DIGEST_SETTING_KEY,
      value: {
        lastSentAtIso: state.lastSentAtIso ?? null,
        items: state.items
      }
    }
  });
}

function buildAdminInfoDigestEmailHtml(items: AdminInfoDigestItem[]): string {
  const rows = items
    .map((item, index) => {
      const createdAt = new Date(item.createdAtIso);
      const createdLabel = Number.isNaN(createdAt.getTime())
        ? item.createdAtIso
        : formatDateTimeForEmail(createdAt, "America/Montevideo");
      const metaHtml = (item.metaLines ?? []).length
        ? `<ul style="margin:6px 0 0 18px;padding:0;color:#425066;font-size:13px;line-height:1.5;">${(item.metaLines ?? [])
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("")}</ul>`
        : "";

      return `
        <div style="border:1px solid #dbe5f3;border-radius:10px;padding:12px;background:#f8fbff;margin:0 0 10px;">
          <p style="margin:0 0 4px;color:#1d3a72;font-size:12px;font-weight:700;">#${index + 1} • ${escapeHtml(createdLabel)}</p>
          <p style="margin:0 0 6px;color:#0b2c5e;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</p>
          <p style="margin:0 0 6px;color:#223042;font-size:14px;"><strong>Asunto:</strong> ${escapeHtml(item.subject)}</p>
          <p style="margin:0;color:#223042;font-size:14px;line-height:1.5;">${escapeHtml(item.summary)}</p>
          ${metaHtml}
        </div>
      `;
    })
    .join("");

  const contentHtml = `
    <p style="margin:0 0 10px;color:#223042;">Este resumen agrupa notificaciones informativas para reducir volumen de correo.</p>
    ${rows}
  `;

  return buildBrandedEmailLayout({
    preheader: "Resumen de notificaciones informativas para admins.",
    title: "Resumen operativo para admins",
    greeting: "Hola,",
    paragraphs: [`Incluye ${items.length} evento(s) informativo(s) recientes.`],
    contentHtml,
    metaLines: [
      "Las alertas criticas se siguen enviando de forma inmediata.",
      "Este resumen se emite cada 45 minutos o al acumular suficientes eventos."
    ]
  });
}

async function sendAdminEmailByPriority(input: {
  priority: AdminNotificationPriority;
  subject: string;
  html?: string;
  title?: string;
  summary?: string;
  metaLines?: string[];
}): Promise<void> {
  const recipients = await listAdminNotificationEmails();
  if (recipients.length === 0) return;

  if (input.priority === "CRITICAL") {
    if (!input.html) return;
    await sendBroadcastEmail({
      recipients,
      subject: input.subject,
      html: input.html
    });
    return;
  }

  const state = await loadAdminInfoDigestState();
  state.items.push({
    createdAtIso: new Date().toISOString(),
    subject: input.subject,
    title: (input.title ?? input.subject).trim() || input.subject,
    summary: (input.summary ?? "Notificacion informativa").trim() || "Notificacion informativa",
    metaLines: (input.metaLines ?? []).filter(Boolean).slice(0, 6)
  });
  state.items = state.items.slice(-ADMIN_INFO_DIGEST_MAX_ITEMS);

  const nowMs = Date.now();
  const lastSentMs = state.lastSentAtIso ? new Date(state.lastSentAtIso).getTime() : 0;
  const elapsedMs = Number.isFinite(lastSentMs) ? nowMs - lastSentMs : Number.POSITIVE_INFINITY;
  const shouldFlush =
    state.items.length >= ADMIN_INFO_DIGEST_MAX_ITEMS ||
    elapsedMs >= ADMIN_INFO_DIGEST_FLUSH_INTERVAL_MS;

  if (!shouldFlush) {
    await saveAdminInfoDigestState(state);
    return;
  }

  const html = buildAdminInfoDigestEmailHtml(state.items);
  const subject = `Resumen admins: ${state.items.length} evento(s) informativo(s)`;

  await sendBroadcastEmail({
    recipients,
    subject,
    html
  });

  state.items = [];
  state.lastSentAtIso = new Date().toISOString();
  await saveAdminInfoDigestState(state);
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
      role: { in: [...LEGACY_ASSISTANT_ROLES] },
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
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${tituloLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Creada por:</strong> ${actorNombreLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Email creador:</strong> ${actorEmailLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Estado:</strong> ${estadoLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${input.instanceStarts.length}</p>
    </div>
    <p style="margin:0 0 8px;color:#223042;"><strong>Fechas previstas</strong></p>
    <ol style="margin:0 0 12px;padding-left:20px;color:#223042;">
      ${previewRows}
    </ol>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Se registro una nueva solicitud en el sistema.",
    title: "Nueva solicitud creada por docente",
    greeting: "Hola,",
    paragraphs: ["Se registro una nueva solicitud en el sistema."],
    contentHtml
  });
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
  const subject = `Solicitud creada por docente: ${input.titulo}`;
  await sendAdminEmailByPriority({
    priority: "INFO",
    subject,
    title: "Nueva solicitud creada por docente",
    summary: `${input.actorNombre} (${input.actorEmail}) registro "${input.titulo}".`,
    metaLines: [
      `Programa: ${input.programaNombre?.trim() || "-"}`,
      `Modalidad: ${input.modalidad}`,
      `Estado: ${input.estadoSolicitud}`,
      `Instancias: ${input.instanceStarts.length}`
    ]
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
  const estadoLabel = escapeHtml(formatAssistantInterestLabel(input.estadoInteres));
  const tituloLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const inicioLabel = escapeHtml(formatDateTimeForEmail(input.inicio, input.timezone));
  const finLabel = escapeHtml(formatDateTimeForEmail(input.fin, input.timezone));
  const comentarioLabel = escapeHtml((input.comentario ?? "").trim() || "Sin comentario");
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${tituloLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Asistente:</strong> ${asistenteNombreLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Email asistente:</strong> ${asistenteEmailLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Preferencia:</strong> ${estadoLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Inicio:</strong> ${inicioLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Fin:</strong> ${finLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Comentario:</strong> ${comentarioLabel}</p>
    </div>
  `;

  return buildBrandedEmailLayout({
    preheader: "Un asistente Zoom registro su preferencia para una instancia.",
    title: "Preferencia de asistencia actualizada",
    greeting: "Hola,",
    paragraphs: ["Un asistente Zoom registro su preferencia para una instancia."],
    contentHtml
  });
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
  if (!shouldNotifyAdminsForAssistantPreference(input.estadoInteres)) {
    return;
  }

  const subject = `Postulacion de asistencia: ${input.titulo}`;
  const html = buildAssistantPreferenceAdminEmailHtml(input);
  await sendAdminEmailByPriority({
    priority: "CRITICAL",
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
  const modalidadLabel = escapeHtml(input.modalidad);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const asistenteNombreLabel = escapeHtml(input.asistenteNombre);
  const asistenteEmailLabel = escapeHtml(input.asistenteEmail);
  const inicioLabel = escapeHtml(formatDateTimeForEmail(input.inicio, input.timezone));
  const finLabel = escapeHtml(formatDateTimeForEmail(input.fin, input.timezone));
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Inicio:</strong> ${inicioLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Fin:</strong> ${finLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Asistente asignado:</strong> ${asistenteNombreLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Email asistente:</strong> ${asistenteEmailLabel}</p>
    </div>
  `;

  return buildBrandedEmailLayout({
    preheader: "Se confirmo la persona de asistencia para esta instancia.",
    title: "Asignacion de monitoreo confirmada",
    greeting: "Hola,",
    paragraphs: ["Se confirmo la persona de asistencia para esta instancia."],
    contentHtml,
    actionLabel: input.joinUrl ? "Abrir reunion en Zoom" : undefined,
    actionUrl: input.joinUrl ?? undefined
  });
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

type AssistanceCancellationRecipient = {
  email: string;
  nombre: string;
  instancias: Array<{
    inicio: Date;
    fin: Date;
  }>;
};

function buildAssistanceCancelledEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  timezone: string;
  recipientName: string;
  actorNombre: string;
  actorEmail: string;
  motivo?: string | null;
  instancias: Array<{
    inicio: Date;
    fin: Date;
  }>;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const responsableLabel = escapeHtml(input.responsableNombre?.trim() || "-");
  const actorLabel = escapeHtml(input.actorNombre);
  const actorEmailLabel = escapeHtml(input.actorEmail);
  const motivoLabel = escapeHtml((input.motivo ?? "").trim() || "Sin detalle adicional.");
  const previewCount = Math.min(input.instancias.length, 30);
  const previewRows = input.instancias
    .slice(0, previewCount)
    .map((item, index) => (
      `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(item.inicio, input.timezone))} - ${escapeHtml(formatDateTimeForEmail(item.fin, input.timezone))}</li>`
    ))
    .join("");
  const extraCount = input.instancias.length - previewCount;
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Responsable:</strong> ${responsableLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Actualizado por:</strong> ${actorLabel} (${actorEmailLabel})</p>
      <p style="margin:0;color:#223042;"><strong>Motivo:</strong> ${motivoLabel}</p>
    </div>
    <p style="margin:0 0 8px;color:#223042;font-weight:700;">Instancias afectadas:</p>
    <ol style="margin:0 0 14px 18px;padding:0;color:#223042;line-height:1.5;">${previewRows}</ol>
    ${
      extraCount > 0
        ? `<p style="margin:0;color:#5b6576;font-size:13px;">Se omitieron ${extraCount} instancia(s) adicionales en este resumen.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Se cancelo la asistencia Zoom asignada para una solicitud.",
    title: "Asistencia Zoom cancelada",
    greeting: `Hola ${input.recipientName},`,
    paragraphs: ["Se actualizo una solicitud y ya no requiere asistencia Zoom."],
    contentHtml
  });
}

async function sendAssistanceCancelledEmails(input: {
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  timezone: string;
  actorNombre: string;
  actorEmail: string;
  motivo?: string | null;
  recipients: AssistanceCancellationRecipient[];
}): Promise<number> {
  if (input.recipients.length === 0) return 0;

  const client = new EmailClient();
  const subject = `Asistencia cancelada: ${input.titulo}`;
  let sentCount = 0;

  for (const recipient of input.recipients) {
    const to = recipient.email.trim().toLowerCase();
    if (!EMAIL_LINE_REGEX.test(to)) continue;

    const html = buildAssistanceCancelledEmailHtml({
      solicitudId: input.solicitudId,
      titulo: input.titulo,
      programaNombre: input.programaNombre,
      responsableNombre: input.responsableNombre,
      timezone: input.timezone,
      recipientName: recipient.nombre || to,
      actorNombre: input.actorNombre,
      actorEmail: input.actorEmail,
      motivo: input.motivo,
      instancias: [...recipient.instancias].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    });

    try {
      await client.send({
        to,
        subject,
        html
      });
      sentCount += 1;
    } catch (error) {
      logger.warn("No se pudo enviar correo de cancelacion de asistencia.", {
        solicitudId: input.solicitudId,
        to,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return sentCount;
}

function buildSolicitudReminderEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  modalidad: ModalidadReunion;
  estadoSolicitud: EstadoSolicitudSala;
  meetingId: string | null;
  joinUrl: string | null;
  meetingPassword: string | null;
  hostAccount: string | null;
  timezone: string;
  recordatorioMensaje?: string | null;
  actorNombre: string;
  actorEmail: string;
  instancias: Array<{
    inicio: Date;
    fin: Date;
    estadoEvento: EstadoEventoZoom;
    requiereAsistencia: boolean;
    monitorLabel: string | null;
    joinUrl: string | null;
  }>;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const responsableLabel = escapeHtml(input.responsableNombre?.trim() || "-");
  const modalidadLabel = escapeHtml(input.modalidad);
  const estadoLabel = escapeHtml(getSolicitudStatusLabel(input.estadoSolicitud));
  const meetingLabel = escapeHtml(input.meetingId ?? "-");
  const meetingPasswordLabel = escapeHtml(input.meetingPassword ?? "No disponible");
  const hostLabel = escapeHtml(input.hostAccount ?? "-");
  const joinUrlLabel = escapeHtml(input.joinUrl ?? "No disponible");
  const actorNombreLabel = escapeHtml(input.actorNombre);
  const actorEmailLabel = escapeHtml(input.actorEmail);
  const previewCount = Math.min(input.instancias.length, 40);
  const previewRows = input.instancias
    .slice(0, previewCount)
    .map((item, index) => {
      const rango = `${formatDateTimeForEmail(item.inicio, input.timezone)} - ${formatDateTimeForEmail(item.fin, input.timezone)}`;
      const statusLabel = item.estadoEvento === EstadoEventoZoom.CANCELADO ? "Cancelada" : "Programada";
      const monitorLine = item.requiereAsistencia
        ? `<p style="margin: 0 0 6px; color: #334155;"><strong>Asistencia Zoom:</strong> ${escapeHtml(item.monitorLabel?.trim() || "Pendiente")}</p>`
        : "";
      const linkLine = item.joinUrl
        ? `<p style="margin: 0;"><a href="${escapeHtml(item.joinUrl)}" target="_blank" rel="noreferrer" style="color: #1d4ed8; text-decoration: underline;">Abrir instancia</a></p>`
        : "";
      return `
        <li style="margin: 0 0 12px;">
          <div style="border: 1px solid #dbe5f3; border-radius: 10px; padding: 10px 12px; background: #ffffff;">
            <p style="margin: 0 0 6px; font-weight: 700; color: #0f172a;">Instancia ${index + 1}</p>
            <p style="margin: 0 0 6px; color: #334155;">${escapeHtml(rango)}</p>
            <p style="margin: 0 0 6px; color: #334155;"><strong>Estado:</strong> ${escapeHtml(statusLabel)}</p>
            ${monitorLine}
            ${linkLine}
          </div>
        </li>
      `;
    })
    .join("");
  const extraCount = input.instancias.length - previewCount;
  const reminderMessage = (input.recordatorioMensaje ?? "").trim();
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f1f7ff;margin:0 0 14px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Cuenta anfitriona:</strong> ${hostLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>ID de acceso:</strong> ${meetingLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Enlace de acceso:</strong></p>
      ${
        input.joinUrl
          ? `<p style="margin:0 0 6px;word-break:break-all;"><a href="${escapeHtml(input.joinUrl)}" target="_blank" rel="noreferrer" style="color:#1d4ed8;text-decoration:underline;">${joinUrlLabel}</a></p>`
          : `<p style="margin:0 0 6px;color:#223042;">${joinUrlLabel}</p>`
      }
      <p style="margin:0 0 6px;color:#223042;"><strong>Contrasena de acceso:</strong> ${meetingPasswordLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${input.instancias.length}</p>
    </div>

    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#ffffff;margin:0 0 14px;">
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Responsable:</strong> ${responsableLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Estado:</strong> ${estadoLabel}</p>
    </div>

    ${
      reminderMessage
        ? `<div style="border-left:4px solid #1f4b8f;padding:10px 12px;background:#eff6ff;margin:0 0 14px;">
            <p style="margin:0 0 6px;font-weight:700;color:#223042;">Mensaje adicional</p>
            <p style="margin:0;color:#223042;">${escapeHtml(reminderMessage)}</p>
          </div>`
        : ""
    }

    <p style="margin:0 0 8px;color:#223042;"><strong>Detalle de instancias</strong></p>
    <ul style="margin:0;padding:0;list-style:none;">
      ${previewRows}
    </ul>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Te compartimos nuevamente la informacion operativa de esta reunion.",
    title: "Recordatorio de reunion",
    greeting: "Hola,",
    paragraphs: ["Te compartimos nuevamente la informacion operativa de esta reunion."],
    contentHtml,
    actionLabel: input.joinUrl ? "Abrir reunion en Zoom" : undefined,
    actionUrl: input.joinUrl ?? undefined,
    metaLines: [`Recordatorio enviado por ${actorNombreLabel} (${actorEmailLabel}).`]
  });
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

function buildZoomRecurrencePayloadFromMeetingSnapshot(
  snapshot: ZoomMeetingSnapshot
): ZoomRecurrencePayload | null {
  const rawPayload =
    snapshot.rawPayload && typeof snapshot.rawPayload === "object" && !Array.isArray(snapshot.rawPayload)
      ? (snapshot.rawPayload as Record<string, unknown>)
      : null;
  const recurrenceRaw =
    rawPayload?.recurrence && typeof rawPayload.recurrence === "object" && !Array.isArray(rawPayload.recurrence)
      ? (rawPayload.recurrence as Record<string, unknown>)
      : null;
  if (!recurrenceRaw) return null;

  const type = numberFromUnknown(recurrenceRaw.type);
  const repeatInterval = numberFromUnknown(recurrenceRaw.repeat_interval);
  if (type === null || repeatInterval === null || ![1, 2, 3].includes(type)) {
    return null;
  }

  const payload: ZoomRecurrencePayload = {
    type: type as 1 | 2 | 3,
    repeat_interval: Math.max(1, Math.floor(repeatInterval))
  };

  if (recurrenceRaw.weekly_days != null) {
    payload.weekly_days = String(recurrenceRaw.weekly_days);
  }

  const monthlyDay = numberFromUnknown(recurrenceRaw.monthly_day);
  if (monthlyDay !== null) payload.monthly_day = Math.floor(monthlyDay);

  const monthlyWeek = numberFromUnknown(recurrenceRaw.monthly_week);
  if (monthlyWeek !== null) payload.monthly_week = Math.floor(monthlyWeek) as -1 | 1 | 2 | 3 | 4;

  const monthlyWeekDay = numberFromUnknown(recurrenceRaw.monthly_week_day);
  if (monthlyWeekDay !== null) payload.monthly_week_day = Math.floor(monthlyWeekDay) as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const endTimes = numberFromUnknown(recurrenceRaw.end_times);
  if (endTimes !== null) {
    payload.end_times = Math.max(1, Math.floor(endTimes));
  } else if (
    typeof recurrenceRaw.end_date_time === "string" &&
    recurrenceRaw.end_date_time.trim() !== ""
  ) {
    payload.end_date_time = recurrenceRaw.end_date_time;
  }

  return payload;
}

function countActiveZoomOccurrences(instances: ZoomOccurrenceSnapshot[]): number {
  return instances.reduce((count, instance) => (
    instance.status === "deleted" ? count : count + 1
  ), 0);
}

function findZoomOccurrenceByStart(
  instances: ZoomOccurrenceSnapshot[],
  expectedStart: Date
): ZoomOccurrenceSnapshot | null {
  const expectedMs = expectedStart.getTime();
  let best: ZoomOccurrenceSnapshot | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const instance of instances) {
    if (instance.status === "deleted") continue;
    const currentMs = new Date(instance.startTime).getTime();
    if (!Number.isFinite(currentMs)) continue;
    const diff = Math.abs(currentMs - expectedMs);
    if (diff > 60_000) continue;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = instance;
    }
  }

  return best;
}

function findAnyZoomOccurrenceByStart(
  instances: ZoomOccurrenceSnapshot[],
  expectedStart: Date
): ZoomOccurrenceSnapshot | null {
  const expectedMs = expectedStart.getTime();
  let best: ZoomOccurrenceSnapshot | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const instance of instances) {
    const currentMs = new Date(instance.startTime).getTime();
    if (!Number.isFinite(currentMs)) continue;
    const diff = Math.abs(currentMs - expectedMs);
    if (diff > 60_000) continue;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = instance;
    }
  }

  return best;
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

async function ensureAssistantProfilesForEligibleRoles() {
  const assistantUsers = await db.user.findMany({
    where: {
      role: { in: [...LEGACY_ASSISTANT_ROLES] }
    },
    select: {
      id: true
    }
  });

  if (assistantUsers.length === 0) return;

  await db.asistenteZoom.createMany({
    data: assistantUsers.map((user) => ({
      usuarioId: user.id
    })),
    skipDuplicates: true
  });
}

function assertAssistantEligibleRole(user: SessionUser) {
  if (user.role !== UserRole.ASISTENTE_ZOOM) {
    throw new Error("Solo usuarios con rol Asistente Zoom pueden operar como asistentes.");
  }
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

type ZoomGroupMember = {
  zoomAccountId: string;
  ownerEmail: string;
  nombreCuenta: string;
};

function normalizeZoomGroupMembers(members: Array<Record<string, unknown>>): ZoomGroupMember[] {
  const normalized: ZoomGroupMember[] = [];
  for (const member of members) {
    const zoomAccountId = typeof member.id === "string" ? member.id.trim() : "";
    const ownerEmail =
      typeof member.email === "string" ? member.email.trim().toLowerCase() : "";
    if (!zoomAccountId || !ownerEmail) continue;

    const firstName = typeof member.first_name === "string" ? member.first_name.trim() : "";
    const lastName = typeof member.last_name === "string" ? member.last_name.trim() : "";
    const nombreCuenta = [firstName, lastName].filter(Boolean).join(" ").trim() || ownerEmail;

    normalized.push({
      zoomAccountId,
      ownerEmail,
      nombreCuenta
    });
  }
  return normalized;
}

function resolveZoomUserRefForCuenta(account: CuentaZoom): string | null {
  const zoomAccountId = (account.zoomAccountId ?? "").trim();
  if (zoomAccountId) return zoomAccountId;

  const ownerEmail = (account.ownerEmail ?? "").trim();
  if (!ownerEmail) return null;
  if (ownerEmail.toLowerCase().endsWith("@flacso.local")) return null;
  return ownerEmail;
}

async function syncCuentaZoomAccountsFromGroup(
  zoomClient: ZoomMeetingsClient
): Promise<CuentaZoom[] | null> {
  if (!env.ZOOM_GROUP_ID) return null;

  const membersRaw = await zoomClient.listGroupMembers(env.ZOOM_GROUP_ID, 300).catch(() => []);
  const members = normalizeZoomGroupMembers(membersRaw);
  if (members.length === 0) return [];

  for (const member of members) {
    try {
      const existing = await db.cuentaZoom.findUnique({
        where: { zoomAccountId: member.zoomAccountId }
      });
      if (existing) {
        if (
          existing.ownerEmail !== member.ownerEmail ||
          (existing.nombreCuenta || "").trim() !== member.nombreCuenta ||
          !existing.activa
        ) {
          await db.cuentaZoom.update({
            where: { id: existing.id },
            data: {
              ownerEmail: member.ownerEmail,
              nombreCuenta: member.nombreCuenta,
              activa: true
            }
          });
        }
        continue;
      }

      if (!env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
        logger.warn("No se pudo crear cuenta Zoom local para miembro del grupo (faltan credenciales).", {
          zoomAccountId: member.zoomAccountId,
          ownerEmail: member.ownerEmail
        });
        continue;
      }

      await db.cuentaZoom.create({
        data: {
          nombreCuenta: member.nombreCuenta,
          zoomAccountId: member.zoomAccountId,
          ownerEmail: member.ownerEmail,
          clientId: env.ZOOM_CLIENT_ID,
          clientSecretRef: "env:ZOOM_CLIENT_SECRET",
          activa: true,
          prioridad: 100
        }
      });
    } catch (error) {
      logger.warn("No se pudo sincronizar una cuenta Zoom del grupo en la base local.", {
        zoomAccountId: member.zoomAccountId,
        ownerEmail: member.ownerEmail,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const memberIds = members.map((member) => member.zoomAccountId);
  return db.cuentaZoom.findMany({
    where: {
      activa: true,
      zoomAccountId: { in: memberIds }
    },
    orderBy: [{ prioridad: "asc" }, { createdAt: "asc" }]
  });
}

async function resolveActiveCuentaZoomBySelector(selector: string): Promise<CuentaZoom | null> {
  const normalizedSelector = selector.trim();
  if (!normalizedSelector) return null;

  const directMatch = await db.cuentaZoom.findFirst({
    where: {
      activa: true,
      OR: [
        { id: normalizedSelector },
        { zoomAccountId: normalizedSelector },
        { ownerEmail: { equals: normalizedSelector, mode: "insensitive" } }
      ]
    }
  });
  if (directMatch) return directMatch;

  if (!env.ZOOM_GROUP_ID) return null;

  try {
    const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
    await syncCuentaZoomAccountsFromGroup(zoomClient);
  } catch (error) {
    logger.warn("No se pudo sincronizar cuentas Zoom del grupo al resolver cuenta seleccionada.", {
      selector: normalizedSelector,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }

  return db.cuentaZoom.findFirst({
    where: {
      activa: true,
      OR: [
        { id: normalizedSelector },
        { zoomAccountId: normalizedSelector },
        { ownerEmail: { equals: normalizedSelector, mode: "insensitive" } }
      ]
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
  const enforceGroupAccounts = Boolean(env.ZOOM_GROUP_ID);
  let zoomClient: ZoomMeetingsClient | null = null;
  try {
    zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
  } catch (error) {
    logger.warn("No se pudo inicializar cliente Zoom para validar disponibilidad por cuenta.", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  let activeAccounts: CuentaZoom[] = [];

  if (enforceGroupAccounts) {
    if (!zoomClient) {
      logger.warn("No se pueden validar cuentas del grupo Streaming FLACSO sin cliente Zoom.", {});
      return [];
    }
    const syncedGroupAccounts = await syncCuentaZoomAccountsFromGroup(zoomClient);
    activeAccounts = syncedGroupAccounts ?? [];
  } else {
    activeAccounts = await db.cuentaZoom.findMany({
      where: { activa: true },
      orderBy: [{ prioridad: "asc" }, { createdAt: "asc" }]
    });
  }

  if (activeAccounts.length === 0 && !enforceGroupAccounts) {
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
        const zoomUserRef = resolveZoomUserRefForCuenta(account);
        if (!zoomUserRef) {
          logger.warn("Cuenta Zoom sin referencia válida para validar disponibilidad.", {
            cuentaZoomId: account.id,
            ownerEmail: account.ownerEmail,
            zoomAccountId: account.zoomAccountId
          });
          return {
            account,
            supportsAllInstances: false,
            loadScore: Number.MAX_SAFE_INTEGER,
            dbFutureEventsCount,
            zoomFutureMeetingsCount: 0
          };
        }

        try {
          zoomBusyWindows = await listZoomBusyWindowsForOwner(zoomClient, zoomUserRef);
        } catch (error) {
          logger.warn("No se pudo validar disponibilidad Zoom para una cuenta, se descarta como candidata.", {
            cuentaZoomId: account.id,
            ownerEmail: account.ownerEmail,
            zoomAccountId: account.zoomAccountId,
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
      const fin = item.finProgramadoAt
        ? toDate(item.finProgramadoAt, `instanciasDetalle[${index}].finProgramadoAt`)
        : new Date(inicio.getTime() + durationMinutes * 60000);
      if (fin <= inicio) {
        throw new Error("En instanciasDetalle, finProgramadoAt debe ser posterior a inicioProgramadoAt.");
      }
      return {
        inicio,
        fin
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

function parseStoredInstanceStarts(value: Prisma.JsonValue | null | undefined): Date[] {
  if (!Array.isArray(value)) return [];

  const starts: Date[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const parsed = new Date(item);
    if (Number.isNaN(parsed.getTime())) continue;
    starts.push(parsed);
  }

  starts.sort((a, b) => a.getTime() - b.getTime());
  const deduped: Date[] = [];
  const seen = new Set<number>();
  for (const start of starts) {
    const key = start.getTime();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(start);
  }
  return deduped;
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

type SpecificDatesSyntheticRecurrencePlan = {
  zoomRecurrence: ZoomRecurrencePayload;
  generatedStarts: Date[];
  requestedMinuteKeys: Set<number>;
};

function toMinuteKey(value: Date): number {
  return Math.floor(value.getTime() / 60_000);
}

type SpecificDatesRequestedSchedule = {
  plans: InstancePlan[];
  minuteKeys: Set<number>;
};

function buildSpecificDatesRequestedSchedule(
  instancePlans: InstancePlan[]
): SpecificDatesRequestedSchedule {
  const sortedPlans = [...instancePlans].sort((left, right) => left.inicio.getTime() - right.inicio.getTime());
  const plans: InstancePlan[] = [];
  const minuteKeys = new Set<number>();

  for (const plan of sortedPlans) {
    const minuteKey = toMinuteKey(plan.inicio);
    if (minuteKeys.has(minuteKey)) {
      throw new Error("No puede haber instancias repetidas en fecha y hora.");
    }
    minuteKeys.add(minuteKey);
    plans.push(plan);
  }

  return {
    plans,
    minuteKeys
  };
}

type OrderedAlignmentPair = {
  sourceIndex: number;
  targetIndex: number;
};

type OrderedAlignmentResult = {
  totalShiftMs: number;
  pairs: OrderedAlignmentPair[];
};

function buildMinimalOrderedAlignment(sourceStarts: Date[], targetStarts: Date[]): OrderedAlignmentResult | null {
  const sourceCount = sourceStarts.length;
  const targetCount = targetStarts.length;
  if (sourceCount < targetCount) return null;

  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: sourceCount + 1 }, () => (
    Array.from({ length: targetCount + 1 }, () => INF)
  ));
  const choice: number[][] = Array.from({ length: sourceCount + 1 }, () => (
    Array.from({ length: targetCount + 1 }, () => 0)
  ));

  dp[0]![0] = 0;
  for (let i = 1; i <= sourceCount; i += 1) {
    dp[i]![0] = 0;
    choice[i]![0] = 1; // skip
  }

  for (let i = 1; i <= sourceCount; i += 1) {
    const maxTargetsAtI = Math.min(i, targetCount);
    for (let j = 1; j <= maxTargetsAtI; j += 1) {
      let best = dp[i - 1]![j]!;
      let bestChoice = 1; // skip source i-1

      const sourceStart = sourceStarts[i - 1];
      const targetStart = targetStarts[j - 1];
      const shiftMs = Math.abs(sourceStart!.getTime() - targetStart!.getTime());
      const matchCost = dp[i - 1]![j - 1]! + shiftMs;
      if (matchCost <= best) {
        best = matchCost;
        bestChoice = 2; // match source i-1 with target j-1
      }

      dp[i]![j] = best;
      choice[i]![j] = bestChoice;
    }
  }

  const totalShiftMs = dp[sourceCount]![targetCount]!;
  if (!Number.isFinite(totalShiftMs)) return null;

  const pairs: OrderedAlignmentPair[] = [];
  let i = sourceCount;
  let j = targetCount;
  while (i > 0 && j > 0) {
    const picked = choice[i]![j]!;
    if (picked === 2) {
      pairs.push({ sourceIndex: i - 1, targetIndex: j - 1 });
      i -= 1;
      j -= 1;
      continue;
    }
    i -= 1;
  }

  if (j !== 0) return null;
  pairs.sort((left, right) => left.targetIndex - right.targetIndex);
  return {
    totalShiftMs,
    pairs
  };
}

function addDaysPreservingTime(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDayLocal(base: Date): Date {
  const copy = new Date(base);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function withTemplateTime(baseDay: Date, template: Date): Date {
  const copy = new Date(baseDay);
  copy.setHours(
    template.getHours(),
    template.getMinutes(),
    template.getSeconds(),
    template.getMilliseconds()
  );
  return copy;
}

function buildDailyStartsWithinRange(firstStart: Date, lastStart: Date, intervalDays: number): Date[] {
  const starts: Date[] = [];
  let cursor = new Date(firstStart);
  while (cursor <= lastStart && starts.length < 120) {
    starts.push(new Date(cursor));
    cursor = addDaysPreservingTime(cursor, intervalDays);
  }
  return starts;
}

function buildWeeklyStartsWithinRange(
  firstStart: Date,
  lastStart: Date,
  intervalWeeks: number,
  weeklyDays: number[]
): Date[] {
  const starts: Date[] = [];
  const activeDays = new Set(weeklyDays);
  const firstWeekday = firstStart.getDay() + 1;
  if (!activeDays.has(firstWeekday)) {
    activeDays.add(firstWeekday);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  let dayCursor = startOfDayLocal(firstStart);
  const endDay = startOfDayLocal(lastStart);
  const firstWeekStart = startOfDayLocal(firstStart);
  firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());

  while (dayCursor <= endDay && starts.length < 120) {
    const zoomDay = dayCursor.getDay() + 1;
    if (activeDays.has(zoomDay)) {
      const weekStart = startOfDayLocal(dayCursor);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekDiff = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / (7 * dayMs));
      if (weekDiff % intervalWeeks === 0) {
        const candidate = withTemplateTime(dayCursor, firstStart);
        if (candidate >= firstStart && candidate <= lastStart) {
          starts.push(candidate);
        }
      }
    }
    dayCursor = addDaysPreservingTime(dayCursor, 1);
  }

  return starts;
}

function getMonthlyWeekMarker(date: Date): -1 | 1 | 2 | 3 | 4 {
  const day = date.getDate();
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if (day + 7 > daysInMonth) return -1;
  const ordinal = Math.ceil(day / 7);
  if (ordinal <= 1) return 1;
  if (ordinal === 2) return 2;
  if (ordinal === 3) return 3;
  return 4;
}

function getNthWeekdayOfMonthLocal(
  year: number,
  monthIndex: number,
  monthlyWeek: -1 | 1 | 2 | 3 | 4,
  monthlyWeekDay: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  timeTemplate: Date
): Date | null {
  const targetJsWeekday = monthlyWeekDay - 1;

  if (monthlyWeek === -1) {
    const lastDay = new Date(
      year,
      monthIndex + 1,
      0,
      timeTemplate.getHours(),
      timeTemplate.getMinutes(),
      timeTemplate.getSeconds(),
      timeTemplate.getMilliseconds()
    );
    const delta = (lastDay.getDay() - targetJsWeekday + 7) % 7;
    lastDay.setDate(lastDay.getDate() - delta);
    return lastDay;
  }

  const firstDay = new Date(
    year,
    monthIndex,
    1,
    timeTemplate.getHours(),
    timeTemplate.getMinutes(),
    timeTemplate.getSeconds(),
    timeTemplate.getMilliseconds()
  );
  const delta = (targetJsWeekday - firstDay.getDay() + 7) % 7;
  const dayNumber = 1 + delta + (monthlyWeek - 1) * 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  if (dayNumber > daysInMonth) return null;

  return new Date(
    year,
    monthIndex,
    dayNumber,
    timeTemplate.getHours(),
    timeTemplate.getMinutes(),
    timeTemplate.getSeconds(),
    timeTemplate.getMilliseconds()
  );
}

function buildMonthlyDayStartsWithinRange(
  firstStart: Date,
  lastStart: Date,
  intervalMonths: number,
  monthlyDay: number
): Date[] {
  const starts: Date[] = [];
  let monthOffset = 0;

  while (starts.length < 120 && monthOffset <= 240) {
    const monthBase = new Date(firstStart.getFullYear(), firstStart.getMonth() + monthOffset, 1);
    if (monthBase > lastStart && monthOffset > 0) break;

    const daysInMonth = new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0).getDate();
    if (monthlyDay <= daysInMonth) {
      const candidate = new Date(
        monthBase.getFullYear(),
        monthBase.getMonth(),
        monthlyDay,
        firstStart.getHours(),
        firstStart.getMinutes(),
        firstStart.getSeconds(),
        firstStart.getMilliseconds()
      );
      if (candidate >= firstStart && candidate <= lastStart) {
        starts.push(candidate);
      }
    }

    monthOffset += intervalMonths;
  }

  return starts;
}

function buildMonthlyWeekdayStartsWithinRange(
  firstStart: Date,
  lastStart: Date,
  intervalMonths: number,
  monthlyWeek: -1 | 1 | 2 | 3 | 4,
  monthlyWeekDay: 1 | 2 | 3 | 4 | 5 | 6 | 7
): Date[] {
  const starts: Date[] = [];
  let monthOffset = 0;

  while (starts.length < 120 && monthOffset <= 240) {
    const monthBase = new Date(firstStart.getFullYear(), firstStart.getMonth() + monthOffset, 1);
    if (monthBase > lastStart && monthOffset > 0) break;

    const candidate = getNthWeekdayOfMonthLocal(
      monthBase.getFullYear(),
      monthBase.getMonth(),
      monthlyWeek,
      monthlyWeekDay,
      firstStart
    );
    if (candidate && candidate >= firstStart && candidate <= lastStart) {
      starts.push(candidate);
    }

    monthOffset += intervalMonths;
  }

  return starts;
}

function buildSpecificDatesSyntheticRecurrencePlan(
  instancePlans: InstancePlan[]
): SpecificDatesSyntheticRecurrencePlan {
  const requestedSchedule = buildSpecificDatesRequestedSchedule(instancePlans);
  const requestedPlans = [...requestedSchedule.plans];
  const sortedRequestedStarts = requestedPlans.map((plan) => plan.inicio);

  if (sortedRequestedStarts.length < 2) {
    throw new Error("Se requieren al menos 2 fechas para construir una recurrencia unica.");
  }

  const firstStart = sortedRequestedStarts[0] as Date;
  const lastStart = sortedRequestedStarts[sortedRequestedStarts.length - 1] as Date;
  const requestedCount = requestedPlans.length;
  if (requestedCount < 2) {
    throw new Error("Se requieren al menos 2 fechas distintas para construir una recurrencia unica.");
  }

  type Candidate = {
    zoomRecurrence: ZoomRecurrencePayload;
    generatedStarts: Date[];
    extras: number;
    alignmentShiftMs: number;
    priority: number;
  };

  const candidates: Candidate[] = [];

  function registerCandidate(
    zoomRecurrence: ZoomRecurrencePayload,
    generatedStarts: Date[],
    priority: number
  ) {
    if (generatedStarts.length < requestedCount) return;
    if (generatedStarts.length > 50) return;
    const alignment = buildMinimalOrderedAlignment(generatedStarts, sortedRequestedStarts);
    if (!alignment) return;

    candidates.push({
      zoomRecurrence,
      generatedStarts,
      extras: generatedStarts.length - requestedCount,
      alignmentShiftMs: alignment.totalShiftMs,
      priority
    });
  }

  const weeklyDayCombinations: number[][] = [];
  for (let mask = 1; mask < 1 << 7; mask += 1) {
    const days: number[] = [];
    for (let bit = 0; bit < 7; bit += 1) {
      if ((mask & (1 << bit)) !== 0) days.push(bit + 1);
    }
    weeklyDayCombinations.push(days);
  }
  weeklyDayCombinations.sort((left, right) => left.length - right.length);

  for (const weeklyDays of weeklyDayCombinations) {
    for (let intervalWeeks = 1; intervalWeeks <= 12; intervalWeeks += 1) {
      const generatedStarts = buildWeeklyStartsWithinRange(
        firstStart,
        lastStart,
        intervalWeeks,
        weeklyDays
      );
      registerCandidate(
        {
          type: 2,
          repeat_interval: intervalWeeks,
          weekly_days: weeklyDays.join(","),
          end_times: generatedStarts.length
        },
        generatedStarts,
        2
      );
    }
  }

  for (let intervalDays = 1; intervalDays <= 90; intervalDays += 1) {
    const generatedStarts = buildDailyStartsWithinRange(firstStart, lastStart, intervalDays);
    registerCandidate(
      {
        type: 1,
        repeat_interval: intervalDays,
        end_times: generatedStarts.length
      },
      generatedStarts,
      3
    );
  }

  const monthlyDay = firstStart.getDate();
  const allSameDayOfMonth = sortedRequestedStarts.every((item) => item.getDate() === monthlyDay);
  if (allSameDayOfMonth) {
    for (let intervalMonths = 1; intervalMonths <= 3; intervalMonths += 1) {
      const generatedStarts = buildMonthlyDayStartsWithinRange(
        firstStart,
        lastStart,
        intervalMonths,
        monthlyDay
      );
      registerCandidate(
        {
          type: 3,
          repeat_interval: intervalMonths,
          monthly_day: monthlyDay,
          end_times: generatedStarts.length
        },
        generatedStarts,
        1
      );
    }
  }

  const monthlyWeek = getMonthlyWeekMarker(firstStart);
  const monthlyWeekDay = (firstStart.getDay() + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
  const allSameWeekdayPattern = sortedRequestedStarts.every((item) => {
    const itemWeek = getMonthlyWeekMarker(item);
    const itemWeekday = (item.getDay() + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    return itemWeek === monthlyWeek && itemWeekday === monthlyWeekDay;
  });
  if (allSameWeekdayPattern) {
    for (let intervalMonths = 1; intervalMonths <= 3; intervalMonths += 1) {
      const generatedStarts = buildMonthlyWeekdayStartsWithinRange(
        firstStart,
        lastStart,
        intervalMonths,
        monthlyWeek,
        monthlyWeekDay
      );
      registerCandidate(
        {
          type: 3,
          repeat_interval: intervalMonths,
          monthly_week: monthlyWeek,
          monthly_week_day: monthlyWeekDay,
          end_times: generatedStarts.length
        },
        generatedStarts,
        1
      );
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      "No se pudo construir una recurrencia de Zoom unica que cubra todas las fechas (maximo 50 ocurrencias)."
    );
  }

  candidates.sort((left, right) => {
    if (left.extras !== right.extras) return left.extras - right.extras;
    if (left.alignmentShiftMs !== right.alignmentShiftMs) {
      return left.alignmentShiftMs - right.alignmentShiftMs;
    }
    if (left.generatedStarts.length !== right.generatedStarts.length) {
      return left.generatedStarts.length - right.generatedStarts.length;
    }
    return left.priority - right.priority;
  });

  const best = candidates[0] as Candidate;
  return {
    zoomRecurrence: best.zoomRecurrence,
    generatedStarts: best.generatedStarts,
    requestedMinuteKeys: requestedSchedule.minuteKeys
  };
}

function buildSingleMeetingInputForSpecificDates(
  input: CreateSolicitudInput,
  syntheticPlan: SpecificDatesSyntheticRecurrencePlan
): CreateSolicitudInput {
  const lastStart = syntheticPlan.generatedStarts[syntheticPlan.generatedStarts.length - 1] ?? null;

  return {
    ...input,
    tipoInstancias: TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM,
    fechaFinRecurrencia: lastStart ? lastStart.toISOString() : input.fechaFinRecurrencia,
    fechasInstancias: undefined,
    instanciasDetalle: undefined,
    patronRecurrencia: {
      totalInstancias: syntheticPlan.generatedStarts.length,
      fechaFinal: (lastStart ? lastStart.toISOString() : new Date().toISOString()).slice(0, 10),
      zoomRecurrence: syntheticPlan.zoomRecurrence
    }
  };
}

async function cancelZoomOccurrencesOutsideRequestedSchedule(
  zoomClient: ZoomMeetingsClient,
  zoomSnapshot: ZoomMeetingSnapshot,
  requestedMinuteKeys: Set<number>,
  options?: { strictOccurrenceId?: boolean }
): Promise<void> {
  const strictOccurrenceId = Boolean(options?.strictOccurrenceId);
  const occurrenceIdsToCancel = new Set<string>();

  for (const item of zoomSnapshot.instances) {
    const start = new Date(item.startTime);
    if (Number.isNaN(start.getTime())) continue;
    const minuteKey = toMinuteKey(start);
    if (requestedMinuteKeys.has(minuteKey)) continue;
    if (item.status === "deleted") continue;
    if (!item.occurrenceId) {
      if (strictOccurrenceId) {
        throw new Error(
          `No se pudo cancelar una ocurrencia extra en Zoom porque falta occurrence_id (${item.startTime}).`
        );
      }
      logger.warn("No se pudo cancelar una ocurrencia extra porque Zoom no devolvio occurrence_id.", {
        meetingId: zoomSnapshot.meetingId,
        startTime: item.startTime
      });
      continue;
    }
    occurrenceIdsToCancel.add(item.occurrenceId);
  }

  for (const occurrenceId of occurrenceIdsToCancel) {
    try {
      await zoomClient.deleteMeeting(zoomSnapshot.meetingId, {
        occurrence_id: occurrenceId,
        schedule_for_reminder: false,
        cancel_meeting_reminder: false
      });
    } catch (error) {
      if (error instanceof ZoomApiError && (error.status === 404 || error.code === 3001)) {
        continue;
      }
      throw error;
    }
  }
}

async function alignSpecificDatesScheduleWithZoom(params: {
  zoomClient: ZoomMeetingsClient;
  zoomSnapshot: ZoomMeetingSnapshot;
  requestedPlans: InstancePlan[];
  timezone: string;
}): Promise<ZoomMeetingSnapshot> {
  const { zoomClient, zoomSnapshot, requestedPlans, timezone } = params;
  const requestedSchedule = buildSpecificDatesRequestedSchedule(requestedPlans);
  const requestedEntries = requestedSchedule.plans;

  const availableOccurrences = zoomSnapshot.instances
    .filter((occurrence) => occurrence.status !== "deleted")
    .map((occurrence) => {
      const parsedStart = new Date(occurrence.startTime);
      if (Number.isNaN(parsedStart.getTime())) return null;
      return {
        occurrence,
        parsedStart
      };
    })
    .filter((item): item is { occurrence: ZoomOccurrenceSnapshot; parsedStart: Date } => item !== null)
    .sort((left, right) => left.parsedStart.getTime() - right.parsedStart.getTime());

  if (availableOccurrences.length < requestedEntries.length) {
    throw new Error("Zoom no devolvio suficientes ocurrencias para ajustar las fechas solicitadas.");
  }

  const alignment = buildMinimalOrderedAlignment(
    availableOccurrences.map((item) => item.parsedStart),
    requestedEntries.map((item) => item.inicio)
  );
  if (!alignment) {
    throw new Error("No se pudo alinear las ocurrencias de Zoom con las fechas solicitadas.");
  }

  for (const pair of alignment.pairs) {
    const requestedPlan = requestedEntries[pair.targetIndex] as InstancePlan;
    const matchedOccurrence = availableOccurrences[pair.sourceIndex]?.occurrence;
    if (!matchedOccurrence) {
      throw new Error("No se pudo resolver una ocurrencia de Zoom para ajustar el horario solicitado.");
    }

    const requestedDurationMinutes = Math.max(
      1,
      Math.floor((requestedPlan.fin.getTime() - requestedPlan.inicio.getTime()) / 60_000)
    );
    const matchedStartMs = new Date(matchedOccurrence.startTime).getTime();
    const sameStart = Number.isFinite(matchedStartMs) && Math.abs(matchedStartMs - requestedPlan.inicio.getTime()) <= 60_000;
    const matchedDuration = Math.max(1, matchedOccurrence.durationMinutes || requestedDurationMinutes);
    const sameDuration = matchedDuration === requestedDurationMinutes;

    if (sameStart && sameDuration) {
      continue;
    }

    if (!matchedOccurrence.occurrenceId) {
      throw new Error(
        `No se pudo ajustar el horario en Zoom para ${requestedPlan.inicio.toISOString()} porque la ocurrencia no tiene occurrence_id.`
      );
    }

    await zoomClient.updateMeeting(
      zoomSnapshot.meetingId,
      {
        start_time: formatZoomDateTimeInTimezone(requestedPlan.inicio, timezone),
        duration: requestedDurationMinutes,
        timezone
      },
      { occurrence_id: matchedOccurrence.occurrenceId }
    );
  }

  const snapshotAfterAdjustments = await fetchZoomMeetingSnapshot(zoomClient, zoomSnapshot.meetingId);
  if (!snapshotAfterAdjustments) {
    throw new Error("No se pudo refrescar la reunion en Zoom luego de ajustar horarios por fecha.");
  }

  await cancelZoomOccurrencesOutsideRequestedSchedule(
    zoomClient,
    snapshotAfterAdjustments,
    requestedSchedule.minuteKeys,
    { strictOccurrenceId: true }
  );

  const finalSnapshot = await fetchZoomMeetingSnapshot(zoomClient, zoomSnapshot.meetingId);
  return finalSnapshot ?? snapshotAfterAdjustments;
}

export class SalasService {
  async getDashboardSummary(user: SessionUser) {
    const now = new Date();

    if (user.role === UserRole.ADMINISTRADOR) {
      const criticalWindowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
      const [
        solicitudesTotales,
        manualPendings,
        solicitudesNoResueltas,
        eventosSinCobertura,
        agendaAbierta,
        eventosSinAsistencia7d,
        eventosCriticosSinLinkZoom,
        eventsForCollisionCheck
      ] =
        await Promise.all([
          db.solicitudSala.count(),
          db.solicitudSala.count({
            where: { estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID }
          }),
          db.solicitudSala.count({
            where: {
              estadoSolicitud: {
                in: [
                  EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
                  EstadoSolicitudSala.SIN_CAPACIDAD_ZOOM
                ]
              }
            }
          }),
          db.eventoZoom.count({
            where: { estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR }
          }),
          db.eventoZoom.count({
            where: {
              requiereAsistencia: true,
              agendaAbiertaAt: { not: null },
              agendaCierraAt: { gt: now }
            }
          }),
          db.eventoZoom.count({
            where: {
              inicioProgramadoAt: {
                gt: now,
                lt: criticalWindowEnd
              },
              estadoEvento: {
                notIn: [EstadoEventoZoom.CANCELADO, EstadoEventoZoom.FINALIZADO]
              },
              requiereAsistencia: true,
              asignaciones: {
                none: {
                  tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
                  estadoAsignacion: {
                    in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO]
                  }
                }
              }
            }
          }),
          db.eventoZoom.count({
            where: {
              inicioProgramadoAt: {
                gt: now,
                lt: criticalWindowEnd
              },
              estadoEvento: {
                notIn: [EstadoEventoZoom.CANCELADO, EstadoEventoZoom.FINALIZADO]
              },
              OR: [{ zoomJoinUrl: null }, { zoomMeetingId: null }]
            }
          }),
          db.eventoZoom.findMany({
            where: {
              inicioProgramadoAt: {
                gt: now,
                lt: criticalWindowEnd
              },
              estadoEvento: {
                notIn: [EstadoEventoZoom.CANCELADO, EstadoEventoZoom.FINALIZADO]
              }
            },
            select: {
              id: true,
              cuentaZoomId: true,
              inicioProgramadoAt: true,
              finProgramadoAt: true
            },
            orderBy: {
              inicioProgramadoAt: "asc"
            }
          })
        ]);

      const byAccount = new Map<string, Array<{
        id: string;
        startMs: number;
        endMs: number;
      }>>();

      for (const event of eventsForCollisionCheck) {
        const accountEvents = byAccount.get(event.cuentaZoomId) ?? [];
        accountEvents.push({
          id: event.id,
          startMs: event.inicioProgramadoAt.getTime(),
          endMs: event.finProgramadoAt.getTime()
        });
        byAccount.set(event.cuentaZoomId, accountEvents);
      }

      const collisionEventIds = new Set<string>();
      for (const accountEvents of byAccount.values()) {
        accountEvents.sort((left, right) => left.startMs - right.startMs);
        const active: Array<{ id: string; endMs: number }> = [];

        for (const current of accountEvents) {
          for (let index = active.length - 1; index >= 0; index -= 1) {
            if (active[index].endMs <= current.startMs) {
              active.splice(index, 1);
            }
          }

          for (const existing of active) {
            collisionEventIds.add(existing.id);
            collisionEventIds.add(current.id);
          }

          active.push({ id: current.id, endMs: current.endMs });
        }
      }

      const colisionesZoom7d = collisionEventIds.size;

      return {
        scope: UserRole.ADMINISTRADOR,
        solicitudesTotales,
        manualPendings,
        solicitudesNoResueltas,
        colisionesZoom7d,
        eventosSinAsistencia7d,
        eventosSinCobertura,
        agendaAbierta,
        eventosCriticosSinAsistencia: eventosSinAsistencia7d,
        eventosCriticosSinLinkZoom
      };
    }

    if (user.role === UserRole.DOCENTE) {
      const ownSolicitudesWhere = {
        docente: {
          usuarioId: user.id
        }
      };

      const [solicitudesTotales, solicitudesActivas, proximasReuniones, reunionesConZoom] =
        await Promise.all([
          db.solicitudSala.count({ where: ownSolicitudesWhere }),
          db.solicitudSala.count({
            where: {
              ...ownSolicitudesWhere,
              estadoSolicitud: {
                notIn: [
                  EstadoSolicitudSala.CANCELADA_ADMIN,
                  EstadoSolicitudSala.CANCELADA_DOCENTE
                ]
              }
            }
          }),
          db.eventoZoom.count({
            where: {
              solicitud: ownSolicitudesWhere,
              inicioProgramadoAt: { gte: now },
              estadoEvento: { not: EstadoEventoZoom.CANCELADO }
            }
          }),
          db.eventoZoom.count({
            where: {
              solicitud: ownSolicitudesWhere,
              inicioProgramadoAt: { gte: now },
              zoomMeetingId: { not: null },
              estadoEvento: { not: EstadoEventoZoom.CANCELADO }
            }
          })
        ]);

      return {
        scope: UserRole.DOCENTE,
        solicitudesTotales,
        solicitudesActivas,
        proximasReuniones,
        reunionesConZoom
      };
    }

    if (user.role === UserRole.ASISTENTE_ZOOM) {
      const assistant = await getOrCreateAsistente(user);
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
      );
      const nextMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
      );
      const previousMonthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)
      );

      const [agendaDisponible, misPostulaciones, misAsignacionesProximas, executedAssignments] =
        await Promise.all([
          db.eventoZoom.count({
            where: {
              requiereAsistencia: true,
              estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR,
              agendaAbiertaAt: { not: null },
              agendaCierraAt: { gt: now },
              inicioProgramadoAt: { gte: now },
              estadoEvento: { not: EstadoEventoZoom.CANCELADO }
            }
          }),
          db.interesAsistenteEvento.count({
            where: {
              asistenteZoomId: assistant.id,
              estadoInteres: EstadoInteresAsistente.ME_INTERESA,
              evento: {
                inicioProgramadoAt: { gte: now },
                estadoEvento: { not: EstadoEventoZoom.CANCELADO }
              }
            }
          }),
          db.asignacionAsistente.count({
            where: {
              asistenteZoomId: assistant.id,
              tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
              estadoAsignacion: {
                in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO]
              },
              evento: {
                inicioProgramadoAt: { gte: now },
                estadoEvento: { not: EstadoEventoZoom.CANCELADO }
              }
            }
          }),
          db.asignacionAsistente.findMany({
            where: {
              asistenteZoomId: assistant.id,
              tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
              estadoAsignacion: {
                in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO]
              },
              evento: {
                requiereAsistencia: true,
                estadoEjecucion: EstadoEjecucionEvento.EJECUTADO,
                estadoEvento: { not: EstadoEventoZoom.CANCELADO },
                inicioProgramadoAt: {
                  gte: previousMonthStart,
                  lt: nextMonthStart
                }
              }
            },
            select: {
              evento: {
                select: {
                  modalidadReunion: true,
                  inicioProgramadoAt: true,
                  finProgramadoAt: true,
                  inicioRealAt: true,
                  finRealAt: true,
                  minutosReales: true
                }
              }
            }
          })
        ]);

      let misMinutosVirtualesMes = 0;
      let misMinutosPresencialesMes = 0;
      let misMinutosVirtualesMesAnterior = 0;
      let misMinutosPresencialesMesAnterior = 0;

      for (const assignment of executedAssignments) {
        const event = assignment.evento;
        const scheduledMinutes = Math.max(
          0,
          Math.round((event.finProgramadoAt.getTime() - event.inicioProgramadoAt.getTime()) / 60000)
        );
        const realMinutes =
          event.minutosReales ??
          Math.max(
            0,
            Math.round(
              ((event.finRealAt ?? event.finProgramadoAt).getTime() -
                (event.inicioRealAt ?? event.inicioProgramadoAt).getTime()) /
                60000
            )
          );
        const minutes = scheduledMinutes > 0 ? scheduledMinutes : realMinutes;

        const isCurrentMonth =
          event.inicioProgramadoAt >= monthStart && event.inicioProgramadoAt < nextMonthStart;
        const isPreviousMonth =
          event.inicioProgramadoAt >= previousMonthStart && event.inicioProgramadoAt < monthStart;
        if (!isCurrentMonth && !isPreviousMonth) continue;

        if (event.modalidadReunion === ModalidadReunion.VIRTUAL) {
          if (isCurrentMonth) misMinutosVirtualesMes += minutes;
          else misMinutosVirtualesMesAnterior += minutes;
          continue;
        }

        if (isCurrentMonth) misMinutosPresencialesMes += minutes;
        else misMinutosPresencialesMesAnterior += minutes;
      }

      const misHorasVirtualesMes = Number((misMinutosVirtualesMes / 60).toFixed(1));
      const misHorasPresencialesMes = Number((misMinutosPresencialesMes / 60).toFixed(1));
      const misHorasMes = Number(
        ((misMinutosVirtualesMes + misMinutosPresencialesMes) / 60).toFixed(1)
      );
      const misHorasVirtualesMesAnterior = Number((misMinutosVirtualesMesAnterior / 60).toFixed(1));
      const misHorasPresencialesMesAnterior = Number(
        (misMinutosPresencialesMesAnterior / 60).toFixed(1)
      );
      const misHorasMesAnterior = Number(
        ((misMinutosVirtualesMesAnterior + misMinutosPresencialesMesAnterior) / 60).toFixed(1)
      );

      return {
        scope: UserRole.ASISTENTE_ZOOM,
        agendaDisponible,
        misPostulaciones,
        misAsignacionesProximas,
        misHorasMes,
        misHorasVirtualesMes,
        misHorasPresencialesMes,
        misHorasMesAnterior,
        misHorasVirtualesMesAnterior,
        misHorasPresencialesMesAnterior
      };
    }

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0)
    );

    const executedAssignments = await db.asignacionAsistente.findMany({
      where: {
        tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
        estadoAsignacion: {
          in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO]
        },
        evento: {
          requiereAsistencia: true,
          estadoEjecucion: EstadoEjecucionEvento.EJECUTADO,
          estadoEvento: { not: EstadoEventoZoom.CANCELADO },
          inicioProgramadoAt: {
            gte: monthStart,
            lt: nextMonthStart
          }
        }
      },
      select: {
        asistenteZoomId: true,
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
        },
        evento: {
          select: {
            id: true,
            modalidadReunion: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            inicioRealAt: true,
            finRealAt: true,
            minutosReales: true
          }
        }
      }
    });

    const eventIds = new Set<string>();
    const assistantIds = new Set<string>();
    let completedMinutes = 0;
    let virtualMinutes = 0;
    let presencialMinutes = 0;
    const perAssistant = new Map<
      string,
      {
        asistenteZoomId: string;
        asistenteNombre: string;
        asistenteEmail: string;
        minutosVirtuales: number;
        minutosPresenciales: number;
        reunionesVirtuales: number;
        reunionesPresenciales: number;
      }
    >();

    for (const assignment of executedAssignments) {
      eventIds.add(assignment.evento.id);
      assistantIds.add(assignment.asistenteZoomId);

      const minutes =
        (() => {
          const scheduledMinutes = Math.max(
            0,
            Math.round(
              (
                assignment.evento.finProgramadoAt.getTime() -
                assignment.evento.inicioProgramadoAt.getTime()
              ) / 60000
            )
          );
          const realMinutes =
            assignment.evento.minutosReales ??
            Math.max(
              0,
              Math.round(
                (
                  (assignment.evento.finRealAt ?? assignment.evento.finProgramadoAt).getTime() -
                  (assignment.evento.inicioRealAt ?? assignment.evento.inicioProgramadoAt).getTime()
                ) /
                  60000
              )
            );
          return scheduledMinutes > 0 ? scheduledMinutes : realMinutes;
        })();
      completedMinutes += minutes;

      if (assignment.evento.modalidadReunion === ModalidadReunion.VIRTUAL) {
        virtualMinutes += minutes;
      } else {
        presencialMinutes += minutes;
      }

      const user = assignment.asistente?.usuario;
      const asistenteNombre =
        user?.name ||
        [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
        user?.email ||
        assignment.asistenteZoomId;
      const asistenteEmail = user?.email ?? "";
      const key = assignment.asistenteZoomId;
      const existing = perAssistant.get(key);
      if (existing) {
        if (assignment.evento.modalidadReunion === ModalidadReunion.VIRTUAL) {
          existing.minutosVirtuales += minutes;
          existing.reunionesVirtuales += 1;
        } else {
          existing.minutosPresenciales += minutes;
          existing.reunionesPresenciales += 1;
        }
      } else {
        perAssistant.set(key, {
          asistenteZoomId: key,
          asistenteNombre,
          asistenteEmail,
          minutosVirtuales: assignment.evento.modalidadReunion === ModalidadReunion.VIRTUAL ? minutes : 0,
          minutosPresenciales: assignment.evento.modalidadReunion === ModalidadReunion.VIRTUAL ? 0 : minutes,
          reunionesVirtuales: assignment.evento.modalidadReunion === ModalidadReunion.VIRTUAL ? 1 : 0,
          reunionesPresenciales: assignment.evento.modalidadReunion === ModalidadReunion.VIRTUAL ? 0 : 1
        });
      }
    }

    const contaduriaHorasPorAsistente = Array.from(perAssistant.values())
      .map((item) => {
        const horasVirtuales = Number((item.minutosVirtuales / 60).toFixed(1));
        const horasPresenciales = Number((item.minutosPresenciales / 60).toFixed(1));
        const horasTotales = Number(((item.minutosVirtuales + item.minutosPresenciales) / 60).toFixed(1));
        const reunionesTotales = item.reunionesVirtuales + item.reunionesPresenciales;

        return {
          asistenteZoomId: item.asistenteZoomId,
          asistenteNombre: item.asistenteNombre,
          asistenteEmail: item.asistenteEmail,
          horasVirtuales,
          horasPresenciales,
          horasTotales,
          reunionesVirtuales: item.reunionesVirtuales,
          reunionesPresenciales: item.reunionesPresenciales,
          reunionesTotales
        };
      })
      .sort((left, right) => {
        if (right.horasTotales !== left.horasTotales) {
          return right.horasTotales - left.horasTotales;
        }
        return left.asistenteNombre.localeCompare(right.asistenteNombre, "es");
      });

    return {
      scope: UserRole.CONTADURIA,
      reunionesCompletadasMes: eventIds.size,
      horasCompletadasMes: Number((completedMinutes / 60).toFixed(1)),
      personasActivasMes: assistantIds.size,
      horasVirtualesMes: Number((virtualMinutes / 60).toFixed(1)),
      horasPresencialesMes: Number((presencialMinutes / 60).toFixed(1)),
      contaduriaHorasPorAsistente
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
          estadoCobertura: event.estadoCobertura,
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
              estadoCobertura: null,
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
          estadoCobertura: matchedFallback?.estadoCobertura ?? null,
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
      const zoomHostAccount = pickZoomHostAccountLabel(
        snapshot?.hostEmail,
        solicitud.cuentaZoomAsignada?.ownerEmail,
        solicitud.cuentaZoomAsignada?.nombreCuenta
      );
      const estadoSolicitudVista = resolveSolicitudDisplayStatus(solicitud.estadoSolicitud, zoomInstances);

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
        estadoSolicitudVista,
        zoomInstances,
        zoomReadFromApi: Boolean(snapshot)
      };
    });
  }

  async updateSolicitudAssistance(
    user: SessionUser,
    solicitudId: string,
    input?: { motivo?: string | null; requiereAsistencia?: boolean | null }
  ) {
    const canManageAsAdmin = user.role === UserRole.ADMINISTRADOR;
    const canManageAsDocente = user.role === UserRole.DOCENTE;
    if (!canManageAsAdmin && !canManageAsDocente) {
      throw new Error("Solo docentes y administracion pueden editar asistencia Zoom en solicitudes.");
    }

    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: {
        id: true,
        titulo: true,
        programaNombre: true,
        responsableNombre: true,
        modalidadReunion: true,
        timezone: true,
        createdByUserId: true,
        estadoSolicitud: true,
        requiereAsistencia: true,
        motivoAsistencia: true,
        docente: {
          select: {
            usuarioId: true
          }
        },
        eventos: {
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            id: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            estadoEvento: true,
            requiereAsistencia: true,
            estadoCobertura: true,
            agendaAbiertaAt: true,
            agendaCierraAt: true,
            asignaciones: {
              where: {
                tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
                estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
              },
              select: {
                id: true,
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
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
    }

    const ownsSolicitud =
      solicitud.createdByUserId === user.id || solicitud.docente.usuarioId === user.id;
    if (!canManageAsAdmin && !ownsSolicitud) {
      throw new Error("No tienes permisos para editar asistencia en esta solicitud.");
    }

    if (
      solicitud.estadoSolicitud === EstadoSolicitudSala.CANCELADA_ADMIN ||
      solicitud.estadoSolicitud === EstadoSolicitudSala.CANCELADA_DOCENTE
    ) {
      throw new Error("No se puede editar asistencia en una solicitud cancelada.");
    }

    const now = new Date();
    const activeEvents = solicitud.eventos.filter((event) => {
      if (event.estadoEvento === EstadoEventoZoom.CANCELADO) return false;
      if (event.estadoEvento === EstadoEventoZoom.FINALIZADO) return false;
      return event.finProgramadoAt > now;
    });

    const requiresAssistance = input?.requiereAsistencia ?? true;

    if (requiresAssistance) {
      if (activeEvents.length === 0) {
        throw new Error("No hay instancias activas o futuras para habilitar asistencia Zoom.");
      }

      const eventsToUpdate = activeEvents.filter((event) => {
        if (!event.requiereAsistencia) return true;
        if (event.estadoCobertura === EstadoCoberturaSoporte.NO_REQUIERE) return true;
        if (event.estadoCobertura === EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR) {
          return !event.agendaAbiertaAt || !event.agendaCierraAt || event.agendaCierraAt <= now;
        }
        return false;
      });

      if (solicitud.requiereAsistencia && eventsToUpdate.length === 0) {
        return {
          solicitudId: solicitud.id,
          requiereAsistencia: true,
          updatedEvents: 0,
          alreadyEnabled: true
        };
      }

      const motivo = (input?.motivo ?? "").trim() ||
        "Asistencia Zoom habilitada desde la pestana Solicitudes.";

      await db.$transaction(async (tx) => {
        await tx.solicitudSala.update({
          where: { id: solicitud.id },
          data: {
            requiereAsistencia: true,
            motivoAsistencia: solicitud.motivoAsistencia?.trim() ? solicitud.motivoAsistencia : motivo
          }
        });

        for (const event of eventsToUpdate) {
          const closeAtBase = new Date(event.inicioProgramadoAt.getTime() - 24 * 60 * 60000);
          const minCloseAt = new Date(now.getTime() + 30 * 60 * 1000);
          const agendaCierraAt = closeAtBase > minCloseAt ? closeAtBase : minCloseAt;

          await tx.eventoZoom.update({
            where: { id: event.id },
            data: {
              requiereAsistencia: true,
              estadoCobertura:
                event.estadoCobertura === EstadoCoberturaSoporte.NO_REQUIERE
                  ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
                  : event.estadoCobertura,
              agendaAbiertaAt: now,
              agendaCierraAt
            }
          });
        }

        await tx.auditoria.create({
          data: {
            actorUsuarioId: user.id,
            accion: "SOLICITUD_HABILITA_ASISTENCIA",
            entidadTipo: "SolicitudSala",
            entidadId: solicitud.id,
            valorAnterior: {
              requiereAsistencia: solicitud.requiereAsistencia,
              estadoSolicitud: solicitud.estadoSolicitud
            },
            valorNuevo: {
              requiereAsistencia: true,
              updatedEvents: eventsToUpdate.length,
              eventsUpdatedIds: eventsToUpdate.map((event) => event.id)
            }
          }
        });
      });

      await notifyAdminTelegramMovement({
        action: "SOLICITUD_HABILITA_ASISTENCIA",
        actorEmail: user.email,
        actorRole: user.role,
        entityType: "SolicitudSala",
        entityId: solicitud.id,
        summary: solicitud.titulo,
        details: {
          updatedEvents: eventsToUpdate.length
        }
      });

      if (eventsToUpdate.length > 0) {
        await sendMonitoringRequiredEmailToAssistantPool({
          solicitudId: solicitud.id,
          titulo: solicitud.titulo,
          modalidad: solicitud.modalidadReunion,
          programaNombre: solicitud.programaNombre ?? null,
          responsableNombre: solicitud.responsableNombre ?? null,
          timezone: solicitud.timezone || "America/Montevideo",
          instanceStarts: eventsToUpdate.map((event) => event.inicioProgramadoAt),
          estadoSolicitud: solicitud.estadoSolicitud
        }).catch((error) => {
          logger.warn("No se pudo enviar correo al pool de asistentes Zoom (edicion de asistencia).", {
            solicitudId: solicitud.id,
            error: error instanceof Error ? error.message : String(error)
          });
        });
      }

      return {
        solicitudId: solicitud.id,
        requiereAsistencia: true,
        updatedEvents: eventsToUpdate.length,
        alreadyEnabled: false
      };
    }

    const eventsToDisable = activeEvents.filter((event) => {
      const hasActiveAssignment = event.asignaciones.length > 0;
      const hasAgendaWindow = Boolean(event.agendaAbiertaAt || event.agendaCierraAt);
      if (event.requiereAsistencia) return true;
      if (event.estadoCobertura !== EstadoCoberturaSoporte.NO_REQUIERE) return true;
      if (hasActiveAssignment) return true;
      return hasAgendaWindow;
    });

    if (!solicitud.requiereAsistencia && eventsToDisable.length === 0) {
      return {
        solicitudId: solicitud.id,
        requiereAsistencia: false,
        updatedEvents: 0,
        cancelledAssignments: 0,
        notifiedAssistants: 0,
        alreadyDisabled: true
      };
    }

    const motivo = (input?.motivo ?? "").trim() ||
      "Asistencia Zoom deshabilitada desde la pestana Solicitudes.";
    const eventsToDisableIds = eventsToDisable.map((event) => event.id);

    const recipientsByEmail = new Map<string, AssistanceCancellationRecipient>();
    for (const event of eventsToDisable) {
      for (const assignment of event.asignaciones) {
        const monitor = assignment.asistente.usuario;
        const monitorEmail = (monitor.email ?? "").trim().toLowerCase();
        if (!EMAIL_LINE_REGEX.test(monitorEmail)) continue;

        if (!recipientsByEmail.has(monitorEmail)) {
          recipientsByEmail.set(monitorEmail, {
            email: monitorEmail,
            nombre: getUserDisplayName(monitor),
            instancias: []
          });
        }

        recipientsByEmail.get(monitorEmail)?.instancias.push({
          inicio: event.inicioProgramadoAt,
          fin: event.finProgramadoAt
        });
      }
    }

    const result = await db.$transaction(async (tx) => {
      await tx.solicitudSala.update({
        where: { id: solicitud.id },
        data: {
          requiereAsistencia: false,
          motivoAsistencia: null
        }
      });

      const eventsResult = eventsToDisableIds.length > 0
        ? await tx.eventoZoom.updateMany({
            where: { id: { in: eventsToDisableIds } },
            data: {
              requiereAsistencia: false,
              estadoCobertura: EstadoCoberturaSoporte.NO_REQUIERE,
              agendaAbiertaAt: null,
              agendaCierraAt: null
            }
          })
        : { count: 0 };

      const assignmentsResult = eventsToDisableIds.length > 0
        ? await tx.asignacionAsistente.updateMany({
            where: {
              eventoZoomId: { in: eventsToDisableIds },
              estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
            },
            data: {
              estadoAsignacion: EstadoAsignacion.CANCELADO
            }
          })
        : { count: 0 };

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "SOLICITUD_DESHABILITA_ASISTENCIA",
          entidadTipo: "SolicitudSala",
          entidadId: solicitud.id,
          valorAnterior: {
            requiereAsistencia: solicitud.requiereAsistencia,
            estadoSolicitud: solicitud.estadoSolicitud
          },
          valorNuevo: {
            requiereAsistencia: false,
            updatedEvents: eventsResult.count,
            eventsUpdatedIds: eventsToDisableIds,
            cancelledAssignments: assignmentsResult.count,
            motivo
          }
        }
      });

      return {
        updatedEvents: eventsResult.count,
        cancelledAssignments: assignmentsResult.count
      };
    });

    await notifyAdminTelegramMovement({
      action: "SOLICITUD_DESHABILITA_ASISTENCIA",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "SolicitudSala",
      entityId: solicitud.id,
      summary: solicitud.titulo,
      details: {
        updatedEvents: result.updatedEvents,
        cancelledAssignments: result.cancelledAssignments
      }
    });

    const notifiedAssistants = await sendAssistanceCancelledEmails({
      solicitudId: solicitud.id,
      titulo: solicitud.titulo,
      programaNombre: solicitud.programaNombre ?? null,
      responsableNombre: solicitud.responsableNombre ?? null,
      timezone: solicitud.timezone || "America/Montevideo",
      actorNombre: getUserDisplayName(user),
      actorEmail: user.email,
      motivo,
      recipients: Array.from(recipientsByEmail.values())
    });

    return {
      solicitudId: solicitud.id,
      requiereAsistencia: false,
      updatedEvents: result.updatedEvents,
      cancelledAssignments: result.cancelledAssignments,
      notifiedAssistants,
      alreadyDisabled: false
    };
  }

  async updateSolicitudInstanceAssistance(
    user: SessionUser,
    solicitudId: string,
    input: {
      eventoId?: string;
      inicioProgramadoAt?: string;
      motivo?: string | null;
      requiereAsistencia: boolean;
    }
  ) {
    const canManageAsAdmin = user.role === UserRole.ADMINISTRADOR;
    const canManageAsDocente = user.role === UserRole.DOCENTE;
    if (!canManageAsAdmin && !canManageAsDocente) {
      throw new Error("Solo docentes y administracion pueden editar asistencia Zoom en solicitudes.");
    }

    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: {
        id: true,
        titulo: true,
        modalidadReunion: true,
        programaNombre: true,
        responsableNombre: true,
        timezone: true,
        createdByUserId: true,
        estadoSolicitud: true,
        requiereAsistencia: true,
        motivoAsistencia: true,
        docente: {
          select: {
            usuarioId: true
          }
        },
        eventos: {
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            id: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            estadoEvento: true,
            requiereAsistencia: true,
            estadoCobertura: true,
            agendaAbiertaAt: true,
            agendaCierraAt: true,
            asignaciones: {
              where: {
                tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
                estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
              },
              select: {
                id: true,
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
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
    }

    const ownsSolicitud =
      solicitud.createdByUserId === user.id || solicitud.docente.usuarioId === user.id;
    if (!canManageAsAdmin && !ownsSolicitud) {
      throw new Error("No tienes permisos para editar asistencia en esta solicitud.");
    }

    if (
      solicitud.estadoSolicitud === EstadoSolicitudSala.CANCELADA_ADMIN ||
      solicitud.estadoSolicitud === EstadoSolicitudSala.CANCELADA_DOCENTE
    ) {
      throw new Error("No se puede editar asistencia en una solicitud cancelada.");
    }

    const targetById = input.eventoId
      ? solicitud.eventos.find((event) => event.id === input.eventoId)
      : null;
    const targetStartMs = input.inicioProgramadoAt ? new Date(input.inicioProgramadoAt).getTime() : NaN;
    const targetByStart = !targetById && Number.isFinite(targetStartMs)
      ? solicitud.eventos.find(
          (event) => Math.abs(event.inicioProgramadoAt.getTime() - targetStartMs) <= 60_000
        )
      : null;
    const targetEvent = targetById ?? targetByStart ?? null;

    if (!targetEvent) {
      throw new Error(
        input.requiereAsistencia
          ? "No se encontro la instancia para habilitar asistencia."
          : "No se encontro la instancia para deshabilitar asistencia."
      );
    }

    if (targetEvent.estadoEvento === EstadoEventoZoom.CANCELADO) {
      throw new Error(
        input.requiereAsistencia
          ? "No se puede habilitar asistencia en una instancia cancelada."
          : "No se puede deshabilitar asistencia en una instancia cancelada."
      );
    }
    if (targetEvent.estadoEvento === EstadoEventoZoom.FINALIZADO) {
      throw new Error(
        input.requiereAsistencia
          ? "No se puede habilitar asistencia en una instancia finalizada."
          : "No se puede deshabilitar asistencia en una instancia finalizada."
      );
    }

    const now = new Date();
    if (targetEvent.finProgramadoAt <= now) {
      throw new Error(
        input.requiereAsistencia
          ? "No se puede habilitar asistencia en una instancia que ya finalizo."
          : "No se puede deshabilitar asistencia en una instancia que ya finalizo."
      );
    }

    if (input.requiereAsistencia) {
      const alreadyEnabled =
        targetEvent.requiereAsistencia &&
        targetEvent.estadoCobertura !== EstadoCoberturaSoporte.NO_REQUIERE;
      if (alreadyEnabled) {
        return {
          solicitudId: solicitud.id,
          eventoId: targetEvent.id,
          requiereAsistencia: true,
          updatedEvents: 0,
          alreadyEnabled: true
        };
      }

      const closeAtBase = new Date(targetEvent.inicioProgramadoAt.getTime() - 24 * 60 * 60000);
      const minCloseAt = new Date(now.getTime() + 30 * 60 * 1000);
      const defaultAgendaCierraAt = closeAtBase > minCloseAt ? closeAtBase : minCloseAt;
      const resolvedAgendaCierraAt =
        targetEvent.agendaCierraAt && targetEvent.agendaCierraAt > now
          ? targetEvent.agendaCierraAt
          : defaultAgendaCierraAt;

      const motivo = (input.motivo ?? "").trim() ||
        "Asistencia Zoom habilitada para una instancia puntual desde la pestana Solicitudes.";

      await db.$transaction(
        async (tx) => {
          await tx.eventoZoom.update({
            where: { id: targetEvent.id },
            data: {
              requiereAsistencia: true,
              estadoCobertura:
                targetEvent.estadoCobertura === EstadoCoberturaSoporte.NO_REQUIERE
                  ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
                  : targetEvent.estadoCobertura,
              agendaAbiertaAt: targetEvent.agendaAbiertaAt ?? now,
              agendaCierraAt: resolvedAgendaCierraAt
            }
          });

          if (!solicitud.requiereAsistencia) {
            await tx.solicitudSala.update({
              where: { id: solicitud.id },
              data: {
                requiereAsistencia: true,
                motivoAsistencia: solicitud.motivoAsistencia?.trim() ? solicitud.motivoAsistencia : motivo
              }
            });
          }

          await tx.auditoria.create({
            data: {
              actorUsuarioId: user.id,
              accion: "SOLICITUD_HABILITA_ASISTENCIA_INSTANCIA",
              entidadTipo: "EventoZoom",
              entidadId: targetEvent.id,
              valorAnterior: {
                solicitudRequiereAsistencia: solicitud.requiereAsistencia,
                eventoRequiereAsistencia: targetEvent.requiereAsistencia,
                eventoEstadoCobertura: targetEvent.estadoCobertura
              },
              valorNuevo: {
                solicitudRequiereAsistencia: true,
                eventoRequiereAsistencia: true,
                eventoEstadoCobertura:
                  targetEvent.estadoCobertura === EstadoCoberturaSoporte.NO_REQUIERE
                    ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
                    : targetEvent.estadoCobertura,
                eventoId: targetEvent.id,
                motivo
              }
            }
          });
        },
        { timeout: 15000 }
      );

      await notifyAdminTelegramMovement({
        action: "SOLICITUD_HABILITA_ASISTENCIA_INSTANCIA",
        actorEmail: user.email,
        actorRole: user.role,
        entityType: "EventoZoom",
        entityId: targetEvent.id,
        summary: solicitud.titulo,
        details: {
          solicitudId: solicitud.id,
          eventoId: targetEvent.id,
          inicioProgramadoAt: targetEvent.inicioProgramadoAt.toISOString()
        }
      });

      await sendMonitoringRequiredEmailToAssistantPool({
        solicitudId: solicitud.id,
        titulo: solicitud.titulo,
        modalidad: solicitud.modalidadReunion,
        programaNombre: solicitud.programaNombre ?? null,
        responsableNombre: solicitud.responsableNombre ?? null,
        timezone: solicitud.timezone || "America/Montevideo",
        instanceStarts: [targetEvent.inicioProgramadoAt],
        estadoSolicitud: solicitud.estadoSolicitud
      }).catch((error) => {
        logger.warn("No se pudo enviar correo al pool de asistentes Zoom (instancia puntual).", {
          solicitudId: solicitud.id,
          eventoId: targetEvent.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });

      return {
        solicitudId: solicitud.id,
        eventoId: targetEvent.id,
        requiereAsistencia: true,
        updatedEvents: 1,
        alreadyEnabled: false
      };
    }
    const alreadyDisabled =
      !targetEvent.requiereAsistencia &&
      targetEvent.estadoCobertura === EstadoCoberturaSoporte.NO_REQUIERE &&
      targetEvent.asignaciones.length === 0 &&
      !targetEvent.agendaAbiertaAt &&
      !targetEvent.agendaCierraAt;
    if (alreadyDisabled) {
      return {
        solicitudId: solicitud.id,
        eventoId: targetEvent.id,
        requiereAsistencia: false,
        updatedEvents: 0,
        cancelledAssignments: 0,
        notifiedAssistants: 0,
        alreadyDisabled: true
      };
    }

    const motivo = (input.motivo ?? "").trim() ||
      "Asistencia Zoom deshabilitada para una instancia puntual desde la pestana Solicitudes.";

    const recipientsByEmail = new Map<string, AssistanceCancellationRecipient>();
    for (const assignment of targetEvent.asignaciones) {
      const monitor = assignment.asistente.usuario;
      const monitorEmail = (monitor.email ?? "").trim().toLowerCase();
      if (!EMAIL_LINE_REGEX.test(monitorEmail)) continue;

      if (!recipientsByEmail.has(monitorEmail)) {
        recipientsByEmail.set(monitorEmail, {
          email: monitorEmail,
          nombre: getUserDisplayName(monitor),
          instancias: []
        });
      }

      recipientsByEmail.get(monitorEmail)?.instancias.push({
        inicio: targetEvent.inicioProgramadoAt,
        fin: targetEvent.finProgramadoAt
      });
    }

    const result = await db.$transaction(
      async (tx) => {
        await tx.eventoZoom.update({
          where: { id: targetEvent.id },
          data: {
            requiereAsistencia: false,
            estadoCobertura: EstadoCoberturaSoporte.NO_REQUIERE,
            agendaAbiertaAt: null,
            agendaCierraAt: null
          }
        });

        const assignmentsResult = await tx.asignacionAsistente.updateMany({
          where: {
            eventoZoomId: targetEvent.id,
            estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
          },
          data: {
            estadoAsignacion: EstadoAsignacion.CANCELADO
          }
        });

        const remainingAssistanceInstances = await tx.eventoZoom.count({
          where: {
            solicitudSalaId: solicitud.id,
            id: { not: targetEvent.id },
            finProgramadoAt: { gt: now },
            estadoEvento: { notIn: [EstadoEventoZoom.CANCELADO, EstadoEventoZoom.FINALIZADO] },
            requiereAsistencia: true,
            estadoCobertura: { not: EstadoCoberturaSoporte.NO_REQUIERE }
          }
        });

        let solicitudRequiereAsistencia = true;
        if (remainingAssistanceInstances === 0) {
          await tx.solicitudSala.update({
            where: { id: solicitud.id },
            data: {
              requiereAsistencia: false,
              motivoAsistencia: null
            }
          });
          solicitudRequiereAsistencia = false;
        }

        await tx.auditoria.create({
          data: {
            actorUsuarioId: user.id,
            accion: "SOLICITUD_DESHABILITA_ASISTENCIA_INSTANCIA",
            entidadTipo: "EventoZoom",
            entidadId: targetEvent.id,
            valorAnterior: {
              solicitudRequiereAsistencia: solicitud.requiereAsistencia,
              eventoRequiereAsistencia: targetEvent.requiereAsistencia,
              eventoEstadoCobertura: targetEvent.estadoCobertura
            },
            valorNuevo: {
              solicitudRequiereAsistencia,
              eventoRequiereAsistencia: false,
              eventoEstadoCobertura: EstadoCoberturaSoporte.NO_REQUIERE,
              eventoId: targetEvent.id,
              cancelledAssignments: assignmentsResult.count,
              motivo
            }
          }
        });

        return {
          cancelledAssignments: assignmentsResult.count,
          solicitudRequiereAsistencia
        };
      },
      { timeout: 15000 }
    );

    await notifyAdminTelegramMovement({
      action: "SOLICITUD_DESHABILITA_ASISTENCIA_INSTANCIA",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "EventoZoom",
      entityId: targetEvent.id,
      summary: solicitud.titulo,
      details: {
        solicitudId: solicitud.id,
        eventoId: targetEvent.id,
        cancelledAssignments: result.cancelledAssignments,
        solicitudRequiereAsistencia: result.solicitudRequiereAsistencia
      }
    });

    const notifiedAssistants = await sendAssistanceCancelledEmails({
      solicitudId: solicitud.id,
      titulo: solicitud.titulo,
      programaNombre: solicitud.programaNombre ?? null,
      responsableNombre: solicitud.responsableNombre ?? null,
      timezone: solicitud.timezone || "America/Montevideo",
      actorNombre: getUserDisplayName(user),
      actorEmail: user.email,
      motivo,
      recipients: Array.from(recipientsByEmail.values())
    });

    return {
      solicitudId: solicitud.id,
      eventoId: targetEvent.id,
      requiereAsistencia: result.solicitudRequiereAsistencia,
      updatedEvents: 1,
      cancelledAssignments: result.cancelledAssignments,
      notifiedAssistants,
      alreadyDisabled: false
    };
  }

  async enableSolicitudInstanceAssistance(
    user: SessionUser,
    solicitudId: string,
    input: {
      eventoId?: string;
      inicioProgramadoAt?: string;
      motivo?: string | null;
    }
  ) {
    return this.updateSolicitudInstanceAssistance(user, solicitudId, {
      ...input,
      requiereAsistencia: true
    });
  }

  async disableSolicitudInstanceAssistance(
    user: SessionUser,
    solicitudId: string,
    input: {
      eventoId?: string;
      inicioProgramadoAt?: string;
      motivo?: string | null;
    }
  ) {
    return this.updateSolicitudInstanceAssistance(user, solicitudId, {
      ...input,
      requiereAsistencia: false
    });
  }

  async enableSolicitudAssistance(
    user: SessionUser,
    solicitudId: string,
    input?: { motivo?: string | null }
  ) {
    return this.updateSolicitudAssistance(user, solicitudId, {
      motivo: input?.motivo,
      requiereAsistencia: true
    });
  }

  async sendSolicitudReminder(
    user: SessionUser,
    solicitudId: string,
    input: {
      toEmail?: string | null;
      mensaje?: string | null;
    }
  ) {
    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      include: {
        docente: {
          select: {
            usuarioId: true,
            usuario: {
              select: {
                email: true,
                name: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        createdBy: {
          select: {
            email: true,
            name: true,
            firstName: true,
            lastName: true
          }
        },
        cuentaZoomAsignada: {
          select: {
            ownerEmail: true,
            nombreCuenta: true
          }
        },
        eventos: {
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            estadoEvento: true,
            requiereAsistencia: true,
            zoomJoinUrl: true,
            zoomMeetingId: true,
            zoomPayloadUltimo: true,
            asignaciones: {
              where: {
                tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
                estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
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
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
    }

    const canManageAll =
      user.role === UserRole.ADMINISTRADOR ||
      user.role === UserRole.CONTADURIA;
    if (
      !canManageAll &&
      solicitud.docente.usuarioId !== user.id &&
      solicitud.createdByUserId !== user.id
    ) {
      throw new Error("No tienes permisos para enviar recordatorios de esta solicitud.");
    }

    const explicitEmail = (input.toEmail ?? "").trim().toLowerCase();
    if (explicitEmail && !EMAIL_LINE_REGEX.test(explicitEmail)) {
      throw new Error("Email destinatario invalido.");
    }

    const responsibleEmail = await resolveResponsibleNotificationEmail(solicitud.responsableNombre);
    const fallbackEmails = [
      responsibleEmail,
      solicitud.createdBy.email,
      solicitud.docente.usuario.email
    ]
      .map((value) => (value ?? "").trim().toLowerCase())
      .filter((value) => EMAIL_LINE_REGEX.test(value));

    const to = explicitEmail || fallbackEmails[0] || "";
    if (!to || !EMAIL_LINE_REGEX.test(to)) {
      throw new Error("No se pudo resolver el email del responsable. Ingresa un destinatario manual.");
    }

    const instancias = solicitud.eventos.map((event) => {
      const monitor = event.asignaciones[0]?.asistente.usuario ?? null;
      return {
        inicio: event.inicioProgramadoAt,
        fin: event.finProgramadoAt,
        estadoEvento: event.estadoEvento,
        requiereAsistencia: event.requiereAsistencia,
        monitorLabel: monitor ? getUserDisplayName(monitor) : null,
        joinUrl: event.zoomJoinUrl ?? null
      };
    });

    const joinUrl =
      solicitud.eventos.find((event) => (event.zoomJoinUrl ?? "").trim())?.zoomJoinUrl ??
      (solicitud.meetingPrincipalId ? buildZoomJoinUrlFromMeetingId(solicitud.meetingPrincipalId) : null);
    const meetingId =
      solicitud.meetingPrincipalId ??
      solicitud.eventos.find((event) => (event.zoomMeetingId ?? "").trim())?.zoomMeetingId ??
      null;
    const hostAccount = pickZoomHostAccountLabel(
      solicitud.cuentaZoomAsignada?.ownerEmail,
      solicitud.cuentaZoomAsignada?.nombreCuenta
    );
    const rawPayload =
      solicitud.eventos.find((event) => Boolean(event.zoomPayloadUltimo))?.zoomPayloadUltimo ??
      undefined;
    const meetingPassword = await resolveMeetingPassword({
      hostAccount,
      joinUrl,
      rawPayload
    });

    const actorNombre =
      getUserDisplayName({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name
      });

    const html = buildSolicitudReminderEmailHtml({
      solicitudId: solicitud.id,
      titulo: solicitud.titulo,
      programaNombre: solicitud.programaNombre ?? null,
      responsableNombre: solicitud.responsableNombre ?? null,
      modalidad: solicitud.modalidadReunion,
      estadoSolicitud: solicitud.estadoSolicitud,
      meetingId,
      joinUrl,
      meetingPassword,
      hostAccount,
      timezone: solicitud.timezone,
      recordatorioMensaje: input.mensaje,
      actorNombre,
      actorEmail: user.email,
      instancias
    });

    const client = new EmailClient();
    await client.send({
      to,
      subject: `Recordatorio de reunion: ${solicitud.titulo}`,
      html
    });

    await notifyAdminTelegramMovement({
      action: "RECORDATORIO_SOLICITUD_ENVIADO",
      actorEmail: user.email,
      actorRole: user.role,
      entityType: "SolicitudSala",
      entityId: solicitud.id,
      summary: solicitud.titulo,
      details: {
        to,
        explicitEmail: Boolean(explicitEmail)
      }
    });

    return {
      solicitudId: solicitud.id,
      sentTo: to
    };
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
        cuentaZoom: {
          select: {
            ownerEmail: true,
            nombreCuenta: true
          }
        },
        solicitud: {
          select: {
            id: true,
            titulo: true,
            programaNombre: true,
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
          programaNombre: event.solicitud.programaNombre ?? null,
          modalidadReunion: event.modalidadReunion,
          zoomMeetingId: meetingId,
          zoomJoinUrl: event.zoomJoinUrl ?? buildZoomJoinUrlFromMeetingId(meetingId),
          zoomHostAccount: pickZoomHostAccountLabel(
            event.cuentaZoom?.ownerEmail,
            event.cuentaZoom?.nombreCuenta
          ),
          zoomAccountEmail: event.cuentaZoom?.ownerEmail ?? null,
          zoomAccountName: event.cuentaZoom?.nombreCuenta ?? null,
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

  async updatePastMeeting(
    admin: SessionUser,
    eventoId: string,
    input: {
      programaNombre?: string;
      monitorEmail?: string;
    }
  ) {
    if (admin.role !== UserRole.ADMINISTRADOR) {
      throw new Error("Forbidden");
    }

    const event = await db.eventoZoom.findUnique({
      where: { id: eventoId },
      select: {
        id: true,
        solicitudSalaId: true,
        modalidadReunion: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        inicioRealAt: true,
        finRealAt: true,
        minutosReales: true,
        solicitud: {
          select: {
            id: true,
            titulo: true,
            programaNombre: true,
            requiereAsistencia: true
          }
        },
        asignaciones: {
          where: {
            tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
            estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
          },
          orderBy: { fechaAsignacionAt: "desc" },
          take: 1,
          select: {
            id: true,
            asistente: {
              select: {
                usuario: {
                  select: {
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!event) {
      throw new Error("Reunion no encontrada.");
    }

    const eventEnd = event.finRealAt ?? event.finProgramadoAt;
    if (eventEnd > new Date()) {
      throw new Error("Solo se pueden editar reuniones que ya finalizaron.");
    }

    const normalizedProgramaNombre =
      typeof input.programaNombre === "string" ? input.programaNombre.trim() : "";
    const programaNombreFinal =
      normalizedProgramaNombre || event.solicitud.programaNombre || null;

    const normalizedMonitorEmail =
      typeof input.monitorEmail === "string" ? input.monitorEmail.trim().toLowerCase() : "";
    const currentMonitorEmail =
      event.asignaciones[0]?.asistente.usuario.email?.trim().toLowerCase() ?? null;
    const shouldUpdateMonitor = Boolean(normalizedMonitorEmail) && normalizedMonitorEmail !== currentMonitorEmail;

    let monitorUser:
      | {
          id: string;
          email: string;
          role: UserRole;
        }
      | null = null;
    let rate:
      | {
          valorHora: Prisma.Decimal;
          moneda: string;
        }
      | null = null;

    if (shouldUpdateMonitor) {
      monitorUser = await db.user.findUnique({
        where: { email: normalizedMonitorEmail },
        select: { id: true, email: true, role: true }
      });
      if (!monitorUser) {
        throw new Error("No existe un usuario de asistencia con ese email.");
      }
      if (!LEGACY_ASSISTANT_ROLES.includes(monitorUser.role)) {
        throw new Error("El usuario seleccionado debe tener rol de Asistente Zoom.");
      }

      const activeRate = await getActiveRate(event.modalidadReunion);
      if (!activeRate) {
        throw new Error("No hay tarifa activa para actualizar la asistencia.");
      }
      rate = {
        valorHora: activeRate.valorHora,
        moneda: activeRate.moneda
      };
    }

    const start = event.inicioRealAt ?? event.inicioProgramadoAt;
    const end = event.finRealAt ?? event.finProgramadoAt;
    const durationMinutes =
      event.minutosReales ?? Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const amount =
      rate != null
        ? calculateEstimatedCost(durationMinutes, Number(rate.valorHora))
        : null;

    await db.$transaction(async (tx) => {
      await tx.solicitudSala.update({
        where: { id: event.solicitud.id },
        data: {
          programaNombre: programaNombreFinal,
          requiereAsistencia: normalizedMonitorEmail ? true : undefined,
          motivoAsistencia:
            normalizedMonitorEmail && !event.solicitud.requiereAsistencia
              ? "Ajuste administrativo de reunion pasada."
              : undefined
        }
      });

      if (shouldUpdateMonitor && monitorUser && rate && amount) {
        const assistant = await tx.asistenteZoom.upsert({
          where: { usuarioId: monitorUser.id },
          create: { usuarioId: monitorUser.id },
          update: {}
        });

        const previousAssignmentId = event.asignaciones[0]?.id ?? null;

        await tx.asignacionAsistente.updateMany({
          where: {
            eventoZoomId: eventoId,
            tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
            estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
          },
          data: {
            estadoAsignacion: EstadoAsignacion.REASIGNADO
          }
        });

        await tx.asignacionAsistente.create({
          data: {
            eventoZoomId: eventoId,
            asistenteZoomId: assistant.id,
            tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
            estadoAsignacion: EstadoAsignacion.ACEPTADO,
            asignadoPorUsuarioId: admin.id,
            motivoAsignacion: "Ajuste administrativo de reunion pasada.",
            reasignacionDeId: previousAssignmentId ?? undefined,
            fechaRespuestaAt: new Date(),
            modalidadSnapshot: event.modalidadReunion,
            tarifaAplicadaHora: rate.valorHora,
            moneda: rate.moneda,
            montoEstimado: amount,
            montoConfirmado: amount
          }
        });

        await tx.eventoZoom.update({
          where: { id: eventoId },
          data: {
            requiereAsistencia: true,
            estadoCobertura: EstadoCoberturaSoporte.CONFIRMADO,
            costoEstimado: amount,
            costoReal: amount
          }
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "EDICION_REUNION_PASADA",
          entidadTipo: "EventoZoom",
          entidadId: eventoId,
          valorAnterior: {
            programaNombre: event.solicitud.programaNombre ?? null,
            monitorEmail: currentMonitorEmail
          },
          valorNuevo: {
            programaNombre: programaNombreFinal,
            monitorEmail: normalizedMonitorEmail || currentMonitorEmail
          }
        }
      });
    });

    await notifyAdminTelegramMovement({
      action: "EDICION_REUNION_PASADA",
      actorEmail: admin.email,
      actorRole: admin.role,
      entityType: "EventoZoom",
      entityId: eventoId,
      summary: event.solicitud.titulo,
      details: {
        programaNombre: programaNombreFinal,
        monitorEmail: normalizedMonitorEmail || currentMonitorEmail
      }
    });

    return { ok: true };
  }

  async createSolicitud(user: SessionUser, input: CreateSolicitudInput) {
    validateZoomRecurrenceRestrictions(input);
    const docentesCopyEmails = parseDocentesEmailsByLine(input.docentesCorreos);
    const userAccessEmails = await listUserAccessEmails(user.id, user.email);
    const linkedDocenteEmail = (docentesCopyEmails[0] ?? userAccessEmails[0] ?? user.email).trim().toLowerCase();
    if (!userAccessEmails.includes(linkedDocenteEmail)) {
      throw new Error("El correo vinculado de la reunion debe pertenecer al usuario que crea la solicitud.");
    }
    const normalizedDocentesCorreos = normalizeDocentesCorreosForStorage(
      [linkedDocenteEmail, ...docentesCopyEmails.filter((email) => email !== linkedDocenteEmail)].join("\n")
    );
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
    const shouldProvisionSpecificDatesWithSingleMeeting =
      input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM;
    let specificDatesSyntheticPlan: SpecificDatesSyntheticRecurrencePlan | null = null;
    let specificDatesProvisioningInput: CreateSolicitudInput | null = null;
    let specificDatesProvisioningError: string | null = null;

    if (shouldProvisionSpecificDatesWithSingleMeeting) {
      try {
        specificDatesSyntheticPlan = buildSpecificDatesSyntheticRecurrencePlan(instancePlans);
        specificDatesProvisioningInput = buildSingleMeetingInputForSpecificDates(
          inputForProvisioning,
          specificDatesSyntheticPlan
        );
        validateZoomRecurrenceRestrictions(specificDatesProvisioningInput);
      } catch (error) {
        specificDatesProvisioningError =
          error instanceof Error
            ? error.message
            : "No se pudo construir una recurrencia unica de Zoom para las fechas solicitadas.";
      }
    }

    const inputForZoomProvisioning = specificDatesProvisioningInput ?? inputForProvisioning;
    const recurrenceEndForProvisioning = inputForZoomProvisioning.fechaFinRecurrencia
      ? toDate(inputForZoomProvisioning.fechaFinRecurrencia, "fechaFinRecurrencia")
      : recurrenceEnd;
    const availableAccounts = await listAvailableCuentaZoomCandidatesForAllInstances(instancePlans);
    const requireManualResolution = Boolean(specificDatesProvisioningError);

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
          fechaFinRecurrencia: recurrenceEndForProvisioning,
          patronRecurrencia: inputForZoomProvisioning.patronRecurrencia as Prisma.InputJsonValue | undefined,
          fechasInstancias: resolvedFechasInstancias,
          cantidadInstancias: instancePlans.length,
          estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
          observacionesAdmin:
            specificDatesProvisioningError ??
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
    let assignedAccount: CuentaZoom | null = requireManualResolution ? availableAccounts[0] : null;
    let zoomSnapshot: ZoomMeetingSnapshot | null = null;
    let lastProvisionError: string | null = null;

    if (!requireManualResolution) {
      if (
        !shouldProvisionSpecificDatesWithSingleMeeting &&
        input.tipoInstancias !== TipoInstancias.UNICA &&
        input.tipoInstancias !== TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM
      ) {
        throw new Error("Solo se pueden crear automaticamente reuniones unicas o recurrentes compatibles con Zoom.");
      }

      for (const candidate of availableAccounts) {
        const candidateSnapshots: ZoomMeetingSnapshot[] = [];
        try {
          const candidateZoomUserRef = resolveZoomUserRefForCuenta(candidate);
          if (!candidateZoomUserRef) {
            lastProvisionError = "La cuenta Zoom candidata no tiene una referencia válida para provisionar.";
            continue;
          }

          const createdSnapshot = await createZoomMeetingForSolicitud({
            accountOwnerEmail: candidateZoomUserRef,
            input: inputForZoomProvisioning,
            start: instancePlans[0]?.inicio ?? start,
            durationMinutes,
            timezone
          });

          candidateSnapshots.push(createdSnapshot);
          let resolvedSnapshot = createdSnapshot;

          if (shouldProvisionSpecificDatesWithSingleMeeting) {
            if (!specificDatesSyntheticPlan) {
              throw new Error("No se pudo resolver un plan de recurrencia para las fechas puntuales.");
            }

            const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
            resolvedSnapshot = await alignSpecificDatesScheduleWithZoom({
              zoomClient,
              zoomSnapshot: resolvedSnapshot,
              requestedPlans: instancePlans,
              timezone
            });
          } else if (
            input.tipoInstancias === TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM &&
            !zoomSnapshotSupportsAllRequestedInstances(resolvedSnapshot, instancePlans)
          ) {
            lastProvisionError =
              "La cuenta Zoom elegida no devolvio todas las ocurrencias de la recurrencia solicitada.";
            try {
              const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
              await rollbackClient.deleteMeeting(resolvedSnapshot.meetingId, {
                schedule_for_reminder: false,
                cancel_meeting_reminder: false
              });
            } catch {
              // If rollback fails, continue trying another account.
            }
            continue;
          }

          assignedAccount = candidate;
          zoomSnapshot = resolvedSnapshot;
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
            fechaFinRecurrencia: recurrenceEndForProvisioning,
            patronRecurrencia: inputForZoomProvisioning.patronRecurrencia as Prisma.InputJsonValue | undefined,
            fechasInstancias: resolvedFechasInstancias,
            cantidadInstancias: instancePlans.length,
            estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID,
            observacionesAdmin:
              specificDatesProvisioningError ??
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

    const provisionedPlans = buildProvisionedEventPlans(zoomSnapshot, instancePlans, durationMinutes);
    const provisionedFechasInstancias = provisionedPlans.map((plan) => plan.inicio.toISOString());
    const meetingPrincipalId: string | null = zoomSnapshot?.meetingId ?? null;
    const motivoMultiplesIds =
      requireManualResolution
        ? "El sistema no pudo asignar un unico meeting ID para la solicitud."
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
          fechaFinRecurrencia: recurrenceEndForProvisioning,
          patronRecurrencia: inputForZoomProvisioning.patronRecurrencia as Prisma.InputJsonValue | undefined,
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
            [zoomSnapshot]
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
      const primaryZoomSnapshot = zoomSnapshot;
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

  async addSolicitudInstance(
    admin: SessionUser,
    solicitudId: string,
    input: {
      inicioProgramadoAt: string;
      finProgramadoAt: string;
    }
  ) {
    if (admin.role !== UserRole.ADMINISTRADOR) {
      throw new Error("Solo administracion puede agregar instancias.");
    }

    const inicio = toDate(input.inicioProgramadoAt, "inicioProgramadoAt");
    const fin = toDate(input.finProgramadoAt, "finProgramadoAt");
    if (fin <= inicio) {
      throw new Error("finProgramadoAt debe ser mayor que inicioProgramadoAt.");
    }
    if (fin <= new Date()) {
      throw new Error("La nueva instancia debe terminar en el futuro.");
    }

    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: {
        id: true,
        titulo: true,
        estadoSolicitud: true,
        modalidadReunion: true,
        tipoInstancias: true,
        timezone: true,
        meetingPrincipalId: true,
        requiereAsistencia: true,
        requiereGrabacion: true,
        cuentaZoomAsignadaId: true,
        fechaInicioSolicitada: true,
        fechaFinSolicitada: true,
        eventos: {
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            id: true,
            cuentaZoomId: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            estadoEvento: true,
            zoomMeetingId: true,
            zoomJoinUrl: true
          }
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
    }
    if (
      solicitud.estadoSolicitud === EstadoSolicitudSala.CANCELADA_ADMIN ||
      solicitud.estadoSolicitud === EstadoSolicitudSala.CANCELADA_DOCENTE
    ) {
      throw new Error("No se pueden agregar instancias en solicitudes canceladas.");
    }

    const timezone = solicitud.timezone || "America/Montevideo";
    if (!isSameCalendarDayInTimezone(inicio, fin, timezone)) {
      throw new Error("La instancia debe comenzar y finalizar el mismo dia.");
    }

    const isDuplicateStart = solicitud.eventos.some((event) => (
      Math.abs(event.inicioProgramadoAt.getTime() - inicio.getTime()) <= 60_000
    ));
    if (isDuplicateStart) {
      throw new Error("Ya existe una instancia con ese mismo horario de inicio.");
    }

    const accountId = solicitud.cuentaZoomAsignadaId ?? solicitud.eventos[0]?.cuentaZoomId ?? null;
    if (!accountId) {
      throw new Error("No se pudo resolver la cuenta Zoom asignada para crear la instancia.");
    }

    const assignedAccount = await db.cuentaZoom.findUnique({
      where: { id: accountId }
    });
    if (!assignedAccount) {
      throw new Error("No se pudo resolver la cuenta Zoom asignada para crear la instancia.");
    }

    const primaryMeetingId = normalizeZoomMeetingId(solicitud.meetingPrincipalId);
    const fallbackJoinUrl = primaryMeetingId ? buildZoomJoinUrlFromMeetingId(primaryMeetingId) : null;
    const primaryJoinUrl =
      solicitud.eventos.find((event) => (event.zoomJoinUrl ?? "").trim())?.zoomJoinUrl ??
      fallbackJoinUrl;
    const durationMinutes = Math.max(1, Math.floor((fin.getTime() - inicio.getTime()) / 60000));
    const requiresAssistance = Boolean(solicitud.requiereAsistencia);
    const nextInstanceCount = solicitud.eventos.length + 1;

    const allInstances = [
      ...solicitud.eventos.map((event) => ({
        inicio: event.inicioProgramadoAt,
        fin: event.finProgramadoAt
      })),
      { inicio, fin }
    ].sort((left, right) => left.inicio.getTime() - right.inicio.getTime());

    const firstInstance = allInstances[0] ?? { inicio, fin };
    const lastInstance = allInstances[allInstances.length - 1] ?? { inicio, fin };
    const recurringStarts = nextInstanceCount > 1
      ? allInstances.map((item) => item.inicio.toISOString())
      : undefined;

    const overlapsInAssignedAccount = await db.eventoZoom.count({
      where: {
        cuentaZoomId: accountId,
        estadoEvento: { not: EstadoEventoZoom.CANCELADO },
        inicioProgramadoAt: { lt: fin },
        finProgramadoAt: { gt: inicio }
      }
    });

    // Regla operativa: usar el mismo ID siempre que sea posible.
    let requiresNewMeetingId = overlapsInAssignedAccount > 0 || !primaryMeetingId;

    let selectedAccount = assignedAccount;
    let eventMeetingId: string | null = null;
    let eventJoinUrl: string | null = primaryJoinUrl;
    let eventStartUrl: string | null = null;
    let eventZoomPayload: Prisma.InputJsonValue | undefined;
    let synchronizedAt: Date | null = null;
    let createdDedicatedMeetingIdForRollback: string | null = null;
    let createdPrimaryOccurrenceIdForRollback: string | null = null;

    if (!requiresNewMeetingId && primaryMeetingId) {
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
        let primarySnapshot = await fetchZoomMeetingSnapshot(zoomClient, primaryMeetingId);

        if (!primarySnapshot) {
          requiresNewMeetingId = true;
        } else {
          let matchedOccurrence = findZoomOccurrenceByStart(primarySnapshot.instances, inicio);

          if (!matchedOccurrence) {
            const recurrencePayload = buildZoomRecurrencePayloadFromMeetingSnapshot(primarySnapshot);
            let updatedRecurrence = false;

            if (recurrencePayload) {
              if (recurrencePayload.end_date_time) {
                const parsedRecurrenceEnd = new Date(recurrencePayload.end_date_time);
                if (Number.isNaN(parsedRecurrenceEnd.getTime()) || parsedRecurrenceEnd < inicio) {
                  recurrencePayload.end_date_time = formatZoomDateTimeInTimezone(inicio, timezone);
                  updatedRecurrence = true;
                }
              } else {
                const activeOccurrences = Math.max(1, countActiveZoomOccurrences(primarySnapshot.instances));
                const requiredEndTimes = Math.max(activeOccurrences + 1, nextInstanceCount);
                if (requiredEndTimes <= 50) {
                  recurrencePayload.end_times = requiredEndTimes;
                  delete recurrencePayload.end_date_time;
                  updatedRecurrence = true;
                }
              }
            }

            if (updatedRecurrence && recurrencePayload) {
              await zoomClient.updateMeeting(primaryMeetingId, {
                recurrence: normalizeRecurrenceForTimezone(recurrencePayload, timezone)
              });
              const refreshedSnapshot = await fetchZoomMeetingSnapshot(zoomClient, primaryMeetingId);
              if (refreshedSnapshot) {
                primarySnapshot = refreshedSnapshot;
              }
            }

            matchedOccurrence = findZoomOccurrenceByStart(primarySnapshot.instances, inicio);
            if (!matchedOccurrence) {
              requiresNewMeetingId = true;
            } else if (updatedRecurrence) {
              createdPrimaryOccurrenceIdForRollback = matchedOccurrence.occurrenceId ?? null;
            }
          }

          if (!requiresNewMeetingId) {
            eventJoinUrl = matchedOccurrence?.joinUrl ?? primarySnapshot.joinUrl ?? eventJoinUrl;
            eventStartUrl = primarySnapshot.startUrl ?? null;
            eventZoomPayload = primarySnapshot.rawPayload;
            synchronizedAt = new Date();
          }
        }
      } catch (error) {
        logger.warn("No se pudo extender la reunion principal en Zoom; se intentara crear la instancia con nuevo ID.", {
          solicitudId: solicitud.id,
          meetingPrincipalId: primaryMeetingId,
          error: error instanceof Error ? error.message : String(error)
        });
        requiresNewMeetingId = true;
      }
    }

    if (requiresNewMeetingId) {
      const singlePlan: InstancePlan[] = [{ inicio, fin }];
      const availableAccounts = await listAvailableCuentaZoomCandidatesForAllInstances(singlePlan);
      const shouldPreferDifferentAccount = overlapsInAssignedAccount > 0;
      const preferredCandidate = shouldPreferDifferentAccount
        ? availableAccounts.find((account) => account.id !== assignedAccount.id)
        : availableAccounts.find((account) => account.id === assignedAccount.id);
      selectedAccount = preferredCandidate ?? availableAccounts[0] ?? assignedAccount;

      const zoomUserRef = resolveZoomUserRefForCuenta(selectedAccount);
      if (!zoomUserRef) {
        throw new Error("La cuenta Zoom seleccionada no tiene referencia valida para crear una reunion.");
      }

      const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
      const hostRef = await resolveZoomHostEmail(zoomUserRef, zoomClient);
      const desiredAutoRecording = solicitud.requiereGrabacion ? "cloud" : "none";

      const createdData = await zoomClient.createMeeting(hostRef, {
        topic: solicitud.titulo,
        type: 2,
        start_time: formatZoomDateTimeInTimezone(inicio, timezone),
        duration: durationMinutes,
        timezone,
        settings: {
          waiting_room: true,
          auto_recording: desiredAutoRecording
        }
      });

      const createdSnapshot = parseZoomMeetingSnapshot(createdData);
      const readSnapshot = await fetchZoomMeetingSnapshot(zoomClient, createdSnapshot.meetingId);
      const effectiveSnapshot = readSnapshot ?? createdSnapshot;

      eventMeetingId = effectiveSnapshot.meetingId;
      eventJoinUrl = effectiveSnapshot.joinUrl ?? eventJoinUrl;
      eventStartUrl = effectiveSnapshot.startUrl ?? null;
      eventZoomPayload = effectiveSnapshot.rawPayload;
      synchronizedAt = new Date();
      createdDedicatedMeetingIdForRollback = effectiveSnapshot.meetingId;
    }

    let createdEvent: { id: string };
    try {
      createdEvent = await db.$transaction(async (tx) => {
        const event = await tx.eventoZoom.create({
          data: {
            solicitudSalaId: solicitud.id,
            cuentaZoomId: selectedAccount.id,
            tipoEvento: nextInstanceCount > 1 ? TipoEventoZoom.RECURRENCE_INSTANCE : TipoEventoZoom.SINGLE,
            grupoRecurrenciaId: nextInstanceCount > 1 ? solicitud.id : null,
            modalidadReunion: solicitud.modalidadReunion,
            inicioProgramadoAt: inicio,
            finProgramadoAt: fin,
            timezone,
            requiereAsistencia: requiresAssistance,
            estadoCobertura: requiresAssistance
              ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
              : EstadoCoberturaSoporte.NO_REQUIERE,
            agendaAbiertaAt: requiresAssistance ? new Date() : null,
            agendaCierraAt: requiresAssistance
              ? new Date(inicio.getTime() - 24 * 60 * 60_000)
              : null,
            estadoEvento: EstadoEventoZoom.PROGRAMADO,
            zoomMeetingId: eventMeetingId,
            zoomJoinUrl: eventJoinUrl,
            zoomStartUrl: eventStartUrl,
            zoomPayloadUltimo: eventZoomPayload,
            sincronizadoConZoomAt: synchronizedAt,
            costoEstimado: calculateEstimatedCost(durationMinutes, 0)
          }
        });

        await tx.solicitudSala.update({
          where: { id: solicitud.id },
          data: {
            tipoInstancias:
              nextInstanceCount > 1 ? TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM : solicitud.tipoInstancias,
            meetingPrincipalId: solicitud.meetingPrincipalId ?? eventMeetingId ?? undefined,
            cantidadInstancias: nextInstanceCount,
            fechaInicioSolicitada: firstInstance.inicio,
            fechaFinSolicitada: firstInstance.fin,
            fechaFinRecurrencia: nextInstanceCount > 1 ? lastInstance.inicio : undefined,
            fechasInstancias: recurringStarts
          }
        });

        await tx.auditoria.create({
          data: {
            actorUsuarioId: admin.id,
            accion: "SOLICITUD_INSTANCIA_AGREGADA",
            entidadTipo: "EventoZoom",
            entidadId: event.id,
            valorNuevo: {
              solicitudId: solicitud.id,
              inicioProgramadoAt: inicio.toISOString(),
              finProgramadoAt: fin.toISOString(),
              requiresAssistance,
              usaMeetingPrincipal: !requiresNewMeetingId,
              nuevoMeetingId: eventMeetingId
            }
          }
        });

        return event;
      });
    } catch (error) {
      if (createdDedicatedMeetingIdForRollback) {
        try {
          const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
          await rollbackClient.deleteMeeting(createdDedicatedMeetingIdForRollback, {
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
        } catch {
          try {
            const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
            await rollbackClient.updateMeetingStatus(createdDedicatedMeetingIdForRollback, "end");
          } catch {
            // Best effort rollback only.
          }
        }
      } else if (primaryMeetingId && createdPrimaryOccurrenceIdForRollback) {
        try {
          const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
          await rollbackClient.deleteMeeting(primaryMeetingId, {
            occurrence_id: createdPrimaryOccurrenceIdForRollback,
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
        } catch {
          // Best effort rollback only.
        }
      }
      throw error;
    }

    await notifyAdminTelegramMovement({
      action: "SOLICITUD_INSTANCIA_AGREGADA",
      actorEmail: admin.email,
      actorRole: admin.role,
      entityType: "EventoZoom",
      entityId: createdEvent.id,
      summary: solicitud.titulo,
      details: {
        solicitudId: solicitud.id,
        inicioProgramadoAt: inicio.toISOString(),
        finProgramadoAt: fin.toISOString(),
        cantidadInstancias: nextInstanceCount,
        usaMeetingPrincipal: !requiresNewMeetingId,
        zoomMeetingId: eventMeetingId ?? primaryMeetingId ?? null,
        cuentaZoomId: selectedAccount.id
      }
    });

    return {
      solicitudId: solicitud.id,
      eventoId: createdEvent.id,
      cantidadInstancias: nextInstanceCount,
      usaMeetingPrincipal: !requiresNewMeetingId,
      zoomMeetingId: eventMeetingId ?? primaryMeetingId ?? null
    };
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
    const targetMeetingId = normalizeZoomMeetingId(targetEvent.zoomMeetingId);
    const zoomMeetingIdForCancel = targetMeetingId ?? zoomMeetingId;

    if (zoomMeetingIdForCancel) {
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();

        // Si la instancia usa su propio meeting ID, se cancela esa reunión específica.
        if (targetMeetingId && targetMeetingId !== zoomMeetingId) {
          await zoomClient.deleteMeeting(targetMeetingId, {
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
          cancelledInZoom = true;
        } else if (solicitud.tipoInstancias === TipoInstancias.UNICA || solicitud.eventos.length <= 1) {
          await zoomClient.deleteMeeting(zoomMeetingIdForCancel, {
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
          cancelledInZoom = true;
        } else {
          if (!occurrenceId) {
            const snapshot = await fetchZoomMeetingSnapshot(zoomClient, zoomMeetingIdForCancel);
            const matched = snapshot?.instances.find((instance) => {
              const instanceStart = new Date(instance.startTime);
              return Math.abs(instanceStart.getTime() - targetEvent.inicioProgramadoAt.getTime()) <= 60_000;
            });
            occurrenceId = matched?.occurrenceId ?? null;
          }

          if (!occurrenceId) {
            if (targetEvent.zoomMeetingId) {
              throw new Error(
                "No se pudo resolver el occurrence_id de Zoom para cancelar la instancia."
              );
            }
          } else {
            await zoomClient.deleteMeeting(zoomMeetingIdForCancel, {
              occurrence_id: occurrenceId,
              schedule_for_reminder: false,
              cancel_meeting_reminder: false
            });
            cancelledInZoom = true;
          }
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
            zoomMeetingId: zoomMeetingIdForCancel,
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
        zoomMeetingId: zoomMeetingIdForCancel,
        cancelledInZoom
      }
    });

    return {
      scope: "INSTANCIA" as const,
      solicitudId: solicitud.id,
      eventoId: targetEvent.id,
      occurrenceId,
      zoomMeetingId: zoomMeetingIdForCancel,
      cancelledInZoom,
      activeEvents: result.activeEvents
    };
  }

  async restoreSolicitudInstance(
    admin: SessionUser,
    solicitudId: string,
    input: {
      eventoId?: string;
      inicioProgramadoAt?: string;
      motivo?: string;
    }
  ) {
    if (admin.role !== UserRole.ADMINISTRADOR) {
      throw new Error("Solo administracion puede descancelar instancias.");
    }

    const solicitud = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: {
        id: true,
        titulo: true,
        estadoSolicitud: true,
        modalidadReunion: true,
        tipoInstancias: true,
        timezone: true,
        meetingPrincipalId: true,
        requiereGrabacion: true,
        requiereAsistencia: true,
        cuentaZoomAsignadaId: true,
        eventos: {
          select: {
            id: true,
            cuentaZoomId: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            timezone: true,
            estadoEvento: true,
            estadoCobertura: true,
            requiereAsistencia: true,
            agendaAbiertaAt: true,
            agendaCierraAt: true,
            zoomMeetingId: true,
            zoomJoinUrl: true,
            zoomStartUrl: true,
            asignaciones: {
              where: {
                tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
                estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
              },
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                estadoAsignacion: true
              }
            }
          },
          orderBy: { inicioProgramadoAt: "asc" }
        }
      }
    });

    if (!solicitud) {
      throw new Error("Solicitud no encontrada.");
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
      throw new Error("No se encontro la instancia a descancelar.");
    }
    if (targetEvent.estadoEvento === EstadoEventoZoom.FINALIZADO) {
      throw new Error("No se puede descancelar una instancia finalizada.");
    }

    const now = new Date();
    if (targetEvent.finProgramadoAt <= now) {
      throw new Error("No se puede descancelar una instancia que ya finalizo por horario.");
    }

    const timezone = solicitud.timezone || targetEvent.timezone || "America/Montevideo";
    const durationMinutes = Math.max(
      1,
      Math.floor((targetEvent.finProgramadoAt.getTime() - targetEvent.inicioProgramadoAt.getTime()) / 60000)
    );
    const primaryMeetingId = normalizeZoomMeetingId(solicitud.meetingPrincipalId);
    const currentTargetMeetingId = normalizeZoomMeetingId(targetEvent.zoomMeetingId);
    const accountId =
      targetEvent.cuentaZoomId ??
      solicitud.cuentaZoomAsignadaId ??
      solicitud.eventos.find((event) => event.cuentaZoomId)?.cuentaZoomId ??
      null;

    if (!accountId) {
      throw new Error("No se pudo resolver la cuenta Zoom para resincronizar la instancia.");
    }

    const assignedAccount = await db.cuentaZoom.findUnique({
      where: { id: accountId }
    });
    if (!assignedAccount) {
      throw new Error("No se pudo resolver la cuenta Zoom para resincronizar la instancia.");
    }

    const preferredJoinUrl =
      targetEvent.zoomJoinUrl ??
      (currentTargetMeetingId ? buildZoomJoinUrlFromMeetingId(currentTargetMeetingId) : null) ??
      (primaryMeetingId ? buildZoomJoinUrlFromMeetingId(primaryMeetingId) : null);

    let resolvedMeetingId = currentTargetMeetingId;
    let resolvedJoinUrl = preferredJoinUrl ?? null;
    let resolvedStartUrl: string | null = targetEvent.zoomStartUrl ?? null;
    let resolvedPayload: Prisma.InputJsonValue | undefined;
    let synchronizedAt: Date | null = null;
    let occurrenceId: string | null = null;
    let usedPrimaryMeeting = false;
    let selectedAccount = assignedAccount;
    let sourceLabel = "SIN_CAMBIOS";

    const ensureDedicatedMeeting = async () => {
      const singlePlan: InstancePlan[] = [
        {
          inicio: targetEvent.inicioProgramadoAt,
          fin: targetEvent.finProgramadoAt
        }
      ];
      const availableAccounts = await listAvailableCuentaZoomCandidatesForAllInstances(singlePlan);
      selectedAccount =
        availableAccounts.find((account) => account.id === assignedAccount.id) ??
        availableAccounts[0] ??
        assignedAccount;

      const zoomUserRef = resolveZoomUserRefForCuenta(selectedAccount);
      if (!zoomUserRef) {
        throw new Error("La cuenta Zoom seleccionada no tiene referencia valida para sincronizar la instancia.");
      }

      const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
      const hostRef = await resolveZoomHostEmail(zoomUserRef, zoomClient);
      const desiredAutoRecording = solicitud.requiereGrabacion ? "cloud" : "none";

      const createdData = await zoomClient.createMeeting(hostRef, {
        topic: solicitud.titulo,
        type: 2,
        start_time: formatZoomDateTimeInTimezone(targetEvent.inicioProgramadoAt, timezone),
        duration: durationMinutes,
        timezone,
        settings: {
          waiting_room: true,
          auto_recording: desiredAutoRecording
        }
      });

      const createdSnapshot = parseZoomMeetingSnapshot(createdData);
      const refreshedSnapshot = await fetchZoomMeetingSnapshot(zoomClient, createdSnapshot.meetingId);
      const effectiveSnapshot = refreshedSnapshot ?? createdSnapshot;

      resolvedMeetingId = effectiveSnapshot.meetingId;
      resolvedJoinUrl = effectiveSnapshot.joinUrl ?? buildZoomJoinUrlFromMeetingId(effectiveSnapshot.meetingId);
      resolvedStartUrl = effectiveSnapshot.startUrl ?? null;
      resolvedPayload = effectiveSnapshot.rawPayload;
      synchronizedAt = new Date();
      occurrenceId = null;
      usedPrimaryMeeting = false;
      sourceLabel = "MEETING_DEDICADO";
    };

    if (currentTargetMeetingId && currentTargetMeetingId !== primaryMeetingId) {
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
        const dedicatedSnapshot = await fetchZoomMeetingSnapshot(zoomClient, currentTargetMeetingId);
        if (!dedicatedSnapshot) {
          await ensureDedicatedMeeting();
        } else {
          resolvedMeetingId = dedicatedSnapshot.meetingId;
          resolvedJoinUrl =
            dedicatedSnapshot.joinUrl ?? resolvedJoinUrl ?? buildZoomJoinUrlFromMeetingId(dedicatedSnapshot.meetingId);
          resolvedStartUrl = dedicatedSnapshot.startUrl ?? null;
          resolvedPayload = dedicatedSnapshot.rawPayload;
          synchronizedAt = new Date();
          occurrenceId = null;
          usedPrimaryMeeting = false;
          sourceLabel = "MEETING_DEDICADO_EXISTENTE";
        }
      } catch (error) {
        if (error instanceof ZoomApiError && (error.status === 404 || error.code === 3001)) {
          await ensureDedicatedMeeting();
        } else {
          throw new Error(
            error instanceof Error
              ? `No se pudo resincronizar la instancia en Zoom: ${error.message}`
              : "No se pudo resincronizar la instancia en Zoom."
          );
        }
      }
    } else if (primaryMeetingId) {
      let shouldFallbackToDedicated = false;
      try {
        const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
        let primarySnapshot = await fetchZoomMeetingSnapshot(zoomClient, primaryMeetingId);

        if (!primarySnapshot) {
          shouldFallbackToDedicated = true;
        } else {
          let matchedOccurrence = findZoomOccurrenceByStart(
            primarySnapshot.instances,
            targetEvent.inicioProgramadoAt
          );

          if (!matchedOccurrence) {
            const matchedAnyOccurrence = findAnyZoomOccurrenceByStart(
              primarySnapshot.instances,
              targetEvent.inicioProgramadoAt
            );

            if (matchedAnyOccurrence?.status === "deleted") {
              shouldFallbackToDedicated = true;
            } else {
              const recurrencePayload = buildZoomRecurrencePayloadFromMeetingSnapshot(primarySnapshot);
              let updatedRecurrence = false;

              if (recurrencePayload) {
                if (recurrencePayload.end_date_time) {
                  const parsedRecurrenceEnd = new Date(recurrencePayload.end_date_time);
                  if (
                    Number.isNaN(parsedRecurrenceEnd.getTime()) ||
                    parsedRecurrenceEnd < targetEvent.inicioProgramadoAt
                  ) {
                    recurrencePayload.end_date_time = formatZoomDateTimeInTimezone(
                      targetEvent.inicioProgramadoAt,
                      timezone
                    );
                    updatedRecurrence = true;
                  }
                } else {
                  const activeOccurrences = Math.max(1, countActiveZoomOccurrences(primarySnapshot.instances));
                  const requiredEndTimes = Math.max(activeOccurrences + 1, solicitud.eventos.length);
                  if (requiredEndTimes <= 50) {
                    recurrencePayload.end_times = requiredEndTimes;
                    delete recurrencePayload.end_date_time;
                    updatedRecurrence = true;
                  }
                }
              }

              if (updatedRecurrence && recurrencePayload) {
                await zoomClient.updateMeeting(primaryMeetingId, {
                  recurrence: normalizeRecurrenceForTimezone(recurrencePayload, timezone)
                });
                const refreshedSnapshot = await fetchZoomMeetingSnapshot(zoomClient, primaryMeetingId);
                if (refreshedSnapshot) {
                  primarySnapshot = refreshedSnapshot;
                }
              }

              matchedOccurrence = findZoomOccurrenceByStart(
                primarySnapshot.instances,
                targetEvent.inicioProgramadoAt
              );
              if (!matchedOccurrence) {
                shouldFallbackToDedicated = true;
              }
            }
          }

          if (!shouldFallbackToDedicated && matchedOccurrence) {
            resolvedMeetingId = null;
            resolvedJoinUrl = matchedOccurrence.joinUrl ?? primarySnapshot.joinUrl ?? resolvedJoinUrl;
            resolvedStartUrl = primarySnapshot.startUrl ?? null;
            resolvedPayload = primarySnapshot.rawPayload;
            synchronizedAt = new Date();
            occurrenceId = matchedOccurrence.occurrenceId ?? null;
            usedPrimaryMeeting = true;
            sourceLabel = "RECURRENCIA_PRINCIPAL";
          }
        }
      } catch (error) {
        if (error instanceof ZoomApiError && (error.status === 404 || error.code === 3001)) {
          shouldFallbackToDedicated = true;
        } else {
          throw new Error(
            error instanceof Error
              ? `No se pudo resincronizar la instancia en Zoom: ${error.message}`
              : "No se pudo resincronizar la instancia en Zoom."
          );
        }
      }

      if (shouldFallbackToDedicated) {
        await ensureDedicatedMeeting();
      }
    } else {
      await ensureDedicatedMeeting();
    }

    const hasAcceptedAssignment = targetEvent.asignaciones.some(
      (assignment) => assignment.estadoAsignacion === EstadoAsignacion.ACEPTADO
    );
    const hasAssignedAssignment = targetEvent.asignaciones.some(
      (assignment) => assignment.estadoAsignacion === EstadoAsignacion.ASIGNADO
    );
    const requiresAssistance = Boolean(targetEvent.requiereAsistencia || solicitud.requiereAsistencia);
    const restoredCoverage = requiresAssistance
      ? hasAcceptedAssignment
        ? EstadoCoberturaSoporte.CONFIRMADO
        : hasAssignedAssignment
          ? EstadoCoberturaSoporte.ASIGNADO
          : EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
      : EstadoCoberturaSoporte.NO_REQUIERE;
    const needsAgendaWindow = requiresAssistance && restoredCoverage === EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR;

    const result = await db.$transaction(async (tx) => {
      const updatedEvent = await tx.eventoZoom.update({
        where: { id: targetEvent.id },
        data: {
          cuentaZoomId: selectedAccount.id,
          tipoEvento: resolvedMeetingId ? TipoEventoZoom.SINGLE : TipoEventoZoom.RECURRENCE_INSTANCE,
          grupoRecurrenciaId: resolvedMeetingId ? null : solicitud.id,
          estadoEvento: EstadoEventoZoom.PROGRAMADO,
          estadoCobertura: restoredCoverage,
          agendaAbiertaAt: needsAgendaWindow ? new Date() : targetEvent.agendaAbiertaAt,
          agendaCierraAt: needsAgendaWindow
            ? new Date(targetEvent.inicioProgramadoAt.getTime() - 24 * 60 * 60_000)
            : targetEvent.agendaCierraAt,
          zoomMeetingId: resolvedMeetingId,
          zoomJoinUrl: resolvedJoinUrl,
          zoomStartUrl: resolvedStartUrl,
          zoomPayloadUltimo: resolvedPayload,
          sincronizadoConZoomAt: synchronizedAt ?? new Date(),
          errorIntegracion: null,
          costoEstimado: calculateEstimatedCost(durationMinutes, 0)
        },
        select: { id: true }
      });

      const activeEvents = await tx.eventoZoom.count({
        where: {
          solicitudSalaId: solicitud.id,
          estadoEvento: { notIn: [EstadoEventoZoom.CANCELADO, EstadoEventoZoom.FINALIZADO] }
        }
      });

      if (activeEvents > 0) {
        await tx.solicitudSala.update({
          where: { id: solicitud.id },
          data: {
            estadoSolicitud: EstadoSolicitudSala.PROVISIONADA,
            canceladaPorDocenteAt: null,
            canceladaMotivo: null,
            meetingPrincipalId: solicitud.meetingPrincipalId ?? (resolvedMeetingId ?? undefined)
          }
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "SOLICITUD_DESCANCELADA_INSTANCIA",
          entidadTipo: "EventoZoom",
          entidadId: updatedEvent.id,
          valorNuevo: {
            solicitudId: solicitud.id,
            zoomMeetingId: resolvedMeetingId ?? primaryMeetingId,
            occurrenceId,
            restoredCoverage,
            source: sourceLabel,
            usedPrimaryMeeting,
            motivo: input.motivo ?? null
          }
        }
      });

      return {
        eventoId: updatedEvent.id,
        activeEvents
      };
    });

    await notifyAdminTelegramMovement({
      action: "SOLICITUD_DESCANCELADA_INSTANCIA",
      actorEmail: admin.email,
      actorRole: admin.role,
      entityType: "EventoZoom",
      entityId: targetEvent.id,
      summary: solicitud.titulo,
      details: {
        solicitudId: solicitud.id,
        source: sourceLabel,
        usedPrimaryMeeting,
        zoomMeetingId: resolvedMeetingId ?? primaryMeetingId,
        occurrenceId
      }
    });

    return {
      solicitudId: solicitud.id,
      eventoId: result.eventoId,
      zoomMeetingId: resolvedMeetingId ?? primaryMeetingId,
      occurrenceId,
      source: sourceLabel,
      usedPrimaryMeeting,
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

    const cuentaZoomAsignadaId = input.cuentaZoomAsignadaId.trim();
    const account = await resolveActiveCuentaZoomBySelector(cuentaZoomAsignadaId);
    if (!account || !account.activa) {
      throw new Error("Cuenta Zoom inválida para resolución manual.");
    }

    const manualMeetingId = normalizeZoomMeetingId(input.zoomMeetingIdManual);
    if (!manualMeetingId) {
      throw new Error("Zoom Meeting ID manual invalido.");
    }

    const existingMeetingEvent = await db.eventoZoom.findUnique({
      where: { zoomMeetingId: manualMeetingId },
      select: { id: true, solicitudSalaId: true }
    });
    if (existingMeetingEvent && existingMeetingEvent.solicitudSalaId !== solicitudId) {
      throw new Error("Ese Zoom Meeting ID ya esta asociado a otra solicitud.");
    }

    const minutes = Math.floor(
      (solicitud.fechaFinSolicitada.getTime() - solicitud.fechaInicioSolicitada.getTime()) / 60000
    );
    const manualInstanceStarts =
      parseStoredInstanceStarts(solicitud.fechasInstancias) ?? [];
    if (manualInstanceStarts.length === 0) {
      manualInstanceStarts.push(new Date(solicitud.fechaInicioSolicitada));
    }
    const manualInstancePlans = manualInstanceStarts.map((inicio) => ({
      inicio,
      fin: new Date(inicio.getTime() + Math.max(1, minutes) * 60_000)
    }));
    const hasMultipleInstances = manualInstancePlans.length > 1;
    const manualJoinUrl = input.zoomJoinUrlManual ?? `https://zoom.us/j/${manualMeetingId}`;

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.solicitudSala.update({
        where: { id: solicitudId },
        data: {
          estadoSolicitud: EstadoSolicitudSala.PROVISIONADA,
          cuentaZoomAsignadaId: account.id,
          meetingPrincipalId: manualMeetingId,
          observacionesAdmin: input.observaciones,
          motivoMultiplesIds: null,
          cantidadInstancias: manualInstancePlans.length
        }
      });

      await tx.eventoZoom.createMany({
        data: manualInstancePlans.map((plan, index) => ({
          solicitudSalaId: solicitudId,
          cuentaZoomId: account.id,
          tipoEvento: hasMultipleInstances
            ? TipoEventoZoom.RECURRENCE_INSTANCE
            : TipoEventoZoom.SINGLE,
          grupoRecurrenciaId: hasMultipleInstances ? solicitudId : null,
          modalidadReunion: solicitud.modalidadReunion,
          inicioProgramadoAt: plan.inicio,
          finProgramadoAt: plan.fin,
          timezone: solicitud.timezone,
          requiereAsistencia: solicitud.requiereAsistencia,
          estadoCobertura: solicitud.requiereAsistencia
            ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
            : EstadoCoberturaSoporte.NO_REQUIERE,
          agendaAbiertaAt: solicitud.requiereAsistencia ? new Date() : null,
          agendaCierraAt: solicitud.requiereAsistencia
            ? new Date(plan.inicio.getTime() - 24 * 60 * 60000)
            : null,
          estadoEvento: "PROGRAMADO",
          zoomMeetingId: index === 0 ? manualMeetingId : null,
          zoomJoinUrl: manualJoinUrl,
          costoEstimado: calculateEstimatedCost(minutes, 0)
        }))
      });

      await tx.resolucionManualProvision.create({
        data: {
          solicitudSalaId: solicitudId,
          usuarioAdministradorId: user.id,
          cuentaZoomAsignadaId: account.id,
          motivoSistema: input.motivoSistema,
          accionTomada: input.accionTomada,
          zoomMeetingIdManual: manualMeetingId,
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
            meetingPrincipalId: manualMeetingId,
            cantidadInstancias: manualInstancePlans.length
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
      summary: `meetingId=${manualMeetingId}`,
      details: {
        cuentaZoomAsignadaId: account.id,
        accionTomada: input.accionTomada,
        cantidadInstancias: manualInstancePlans.length
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
        meetingId: manualMeetingId,
        joinUrl: manualJoinUrl,
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
    assertAssistantEligibleRole(user);
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
    await ensureAssistantProfilesForEligibleRoles();

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
              id: true,
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
            role: { in: [...LEGACY_ASSISTANT_ROLES] }
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

  private async buildAssignmentSuggestionProblem() {
    await ensureAssistantProfilesForEligibleRoles();

    const activeStates: EstadoAsignacion[] = [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO];

    const [virtualRate, hibridaRate, assistants] = await Promise.all([
      getActiveRate(ModalidadReunion.VIRTUAL),
      getActiveRate(ModalidadReunion.HIBRIDA),
      db.asistenteZoom.findMany({
        where: {
          disponibleGeneral: true,
          usuario: {
            role: { in: [...LEGACY_ASSISTANT_ROLES] }
          }
        },
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
        },
        orderBy: {
          usuario: {
            email: "asc"
          }
        }
      })
    ]);

    if (!virtualRate || !hibridaRate) {
      throw new Error("No hay tarifas activas para ambas modalidades (VIRTUAL/HIBRIDA).");
    }

    if (assistants.length === 0) {
      throw new Error("No hay asistentes Zoom disponibles para calcular sugerencias.");
    }

    const assistantNodes: SuggestionAssistantNode[] = assistants.map((assistant) => ({
      id: assistant.id,
      email: assistant.usuario.email,
      nombre:
        assistant.usuario.name ||
        [assistant.usuario.firstName, assistant.usuario.lastName].filter(Boolean).join(" ") ||
        assistant.usuario.email
    }));

    const assistantIds = assistantNodes.map((assistant) => assistant.id);
    const assistantIdSet = new Set(assistantIds);
    const assistantIndex = new Map<string, number>();
    assistantIds.forEach((id, idx) => assistantIndex.set(id, idx));

    const rateByModality = new Map<ModalidadReunion, number>([
      [ModalidadReunion.VIRTUAL, Number(virtualRate.valorHora)],
      [ModalidadReunion.HIBRIDA, Number(hibridaRate.valorHora)]
    ]);

    const candidateEvents = await db.eventoZoom.findMany({
      where: {
        requiereAsistencia: true,
        estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR,
        estadoEvento: { in: [EstadoEventoZoom.CREADO_ZOOM, EstadoEventoZoom.PROGRAMADO] },
        inicioProgramadoAt: { gt: new Date() }
      },
      select: {
        id: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        modalidadReunion: true,
        timezone: true,
        solicitud: {
          select: {
            titulo: true
          }
        },
        intereses: {
          where: {
            estadoInteres: EstadoInteresAsistente.ME_INTERESA
          },
          select: {
            asistenteZoomId: true
          }
        }
      },
      orderBy: { inicioProgramadoAt: "asc" }
    });

    const unsatisfiedEvents: string[] = [];
    const eventNodes: SuggestionEventNode[] = [];

    for (const event of candidateEvents) {
      const candidateAssistantIds = event.intereses
        .map((interest) => interest.asistenteZoomId)
        .filter((assistantId) => assistantIdSet.has(assistantId));

      if (candidateAssistantIds.length === 0) {
        unsatisfiedEvents.push(`${event.solicitud.titulo} (${event.id})`);
        continue;
      }

      const hourlyRate = rateByModality.get(event.modalidadReunion) ?? 0;
      const coverageValue = computeCoverageValue({
        inicioProgramadoAt: event.inicioProgramadoAt,
        finProgramadoAt: event.finProgramadoAt,
        tarifaHora: hourlyRate
      });

      eventNodes.push({
        id: event.id,
        titulo: event.solicitud.titulo,
        inicioProgramadoAtIso: event.inicioProgramadoAt.toISOString(),
        finProgramadoAtIso: event.finProgramadoAt.toISOString(),
        inicioProgramadoMs: event.inicioProgramadoAt.getTime(),
        finProgramadoMs: event.finProgramadoAt.getTime(),
        monthKey: toMonthKey(event.inicioProgramadoAt, event.timezone || "America/Montevideo"),
        modalidadReunion: event.modalidadReunion,
        timezone: event.timezone,
        coverageValue,
        candidateAssistantIds: Array.from(new Set(candidateAssistantIds))
      });
    }

    const monthKeys = Array.from(new Set(eventNodes.map((event) => event.monthKey))).sort((a, b) =>
      a.localeCompare(b)
    );
    const baseLoadsByMonth: SuggestionLoadsByMonth = Object.fromEntries(
      monthKeys.map((key) => [key, Array.from({ length: assistantNodes.length }, () => 0)])
    );
    const schedulesByAssistant: Record<string, Array<[number, number]>> = Object.fromEntries(
      assistantNodes.map((assistant) => [assistant.id, [] as Array<[number, number]>])
    );

    const activeAssignments = await db.asignacionAsistente.findMany({
      where: {
        tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
        estadoAsignacion: { in: activeStates },
        asistenteZoomId: { in: assistantIds },
        evento: {
          estadoEvento: { not: EstadoEventoZoom.CANCELADO },
          inicioProgramadoAt: { gt: new Date() }
        }
      },
      select: {
        asistenteZoomId: true,
        tarifaAplicadaHora: true,
        montoEstimado: true,
        evento: {
          select: {
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            timezone: true,
            modalidadReunion: true
          }
        }
      }
    });

    for (const assignment of activeAssignments) {
      schedulesByAssistant[assignment.asistenteZoomId]?.push([
        assignment.evento.inicioProgramadoAt.getTime(),
        assignment.evento.finProgramadoAt.getTime()
      ]);

      const monthKey = toMonthKey(
        assignment.evento.inicioProgramadoAt,
        assignment.evento.timezone || "America/Montevideo"
      );
      const monthLoads = baseLoadsByMonth[monthKey];
      if (!monthLoads) continue;

      const idx = assistantIndex.get(assignment.asistenteZoomId);
      if (idx === undefined) continue;

      const estimatedValue = assignment.montoEstimado
        ? Number(assignment.montoEstimado)
        : computeCoverageValue({
            inicioProgramadoAt: assignment.evento.inicioProgramadoAt,
            finProgramadoAt: assignment.evento.finProgramadoAt,
            tarifaHora: Number(assignment.tarifaAplicadaHora)
          });
      monthLoads[idx] += estimatedValue;
    }

    eventNodes.sort((left, right) => {
      if (left.candidateAssistantIds.length !== right.candidateAssistantIds.length) {
        return left.candidateAssistantIds.length - right.candidateAssistantIds.length;
      }
      if (left.inicioProgramadoMs !== right.inicioProgramadoMs) {
        return left.inicioProgramadoMs - right.inicioProgramadoMs;
      }
      return left.id.localeCompare(right.id);
    });

    return {
      scopeKey: monthKeys.length > 0 ? `${monthKeys[0]}..${monthKeys[monthKeys.length - 1]}` : "ALL",
      assistants: assistantNodes,
      events: eventNodes,
      baseLoadsByMonth,
      baseSchedulesByAssistant: schedulesByAssistant,
      unsatisfiedEvents
    };
  }

  private findNextSuggestionFromSession(
    session: AssignmentSuggestionSessionValue
  ): AssignmentSuggestionResult | null {
    const assistantIndex = new Map<string, number>();
    session.assistants.forEach((assistant, idx) => assistantIndex.set(assistant.id, idx));

    while (session.frontier.length > 0) {
      const node = session.frontier.pop();
      if (!node) break;

      if (node.eventIndex >= session.events.length) {
        const score = computeSuggestionScoreByMonth(node.loadsByMonth);

        if (session.targetScore === null) {
          session.targetScore = score;
        }
        if (Math.abs(score - session.targetScore) > SUGGESTION_SCORE_EPSILON) {
          continue;
        }

        const signature = buildSuggestionSignature(node.assignmentByEvent);
        if (session.returnedSignatures.includes(signature)) {
          continue;
        }

        session.returnedSignatures.push(signature);

        const byAssistantProjected = new Map<string, number>();
        const byAssistantBase = new Map<string, number>();
        session.assistants.forEach((assistant, idx) => {
          const projected = Object.values(node.loadsByMonth).reduce(
            (sum, monthLoads) => sum + (monthLoads[idx] ?? 0),
            0
          );
          const base = Object.values(session.baseLoadsByMonth).reduce(
            (sum, monthLoads) => sum + (monthLoads[idx] ?? 0),
            0
          );
          byAssistantProjected.set(assistant.id, projected);
          byAssistantBase.set(assistant.id, base);
        });

        const events = session.events.map((event, idx) => {
          const assistantId = node.assignmentByEvent[idx];
          if (!assistantId) {
            throw new Error("La sugerencia quedó incompleta durante el cálculo.");
          }
          const assistant = session.assistants.find((item) => item.id === assistantId);
          if (!assistant) {
            throw new Error("No se encontró información del asistente sugerido.");
          }
          return {
            eventoId: event.id,
            titulo: event.titulo,
            inicioProgramadoAt: event.inicioProgramadoAtIso,
            finProgramadoAt: event.finProgramadoAtIso,
            modalidadReunion: event.modalidadReunion,
            coverageValue: event.coverageValue,
            asistenteZoomId: assistant.id,
            asistenteNombre: assistant.nombre,
            asistenteEmail: assistant.email
          };
        });

        const assistants = session.assistants.map((assistant) => {
          const baseValue = byAssistantBase.get(assistant.id) ?? 0;
          const projectedValue = byAssistantProjected.get(assistant.id) ?? 0;
          return {
            asistenteZoomId: assistant.id,
            asistenteNombre: assistant.nombre,
            asistenteEmail: assistant.email,
            baseValue,
            suggestedValue: projectedValue - baseValue,
            projectedValue
          };
        });

        assistants.sort((left, right) => {
          if (right.projectedValue !== left.projectedValue) {
            return right.projectedValue - left.projectedValue;
          }
          return left.asistenteNombre.localeCompare(right.asistenteNombre, "es");
        });

        return {
          sessionId: session.sessionId,
          scopeKey: session.scopeKey,
          score,
          events,
          assistants
        };
      }

      const event = session.events[node.eventIndex];
      const orderedCandidates = [...event.candidateAssistantIds].sort((left, right) => {
        const leftIdx = assistantIndex.get(left) ?? -1;
        const rightIdx = assistantIndex.get(right) ?? -1;
        const eventLoads = node.loadsByMonth[event.monthKey] ?? [];
        const leftLoad = leftIdx >= 0 ? eventLoads[leftIdx] ?? 0 : Number.POSITIVE_INFINITY;
        const rightLoad = rightIdx >= 0 ? eventLoads[rightIdx] ?? 0 : Number.POSITIVE_INFINITY;
        if (leftLoad !== rightLoad) {
          return leftLoad - rightLoad;
        }
        return left.localeCompare(right);
      });

      const children: SuggestionSearchNode[] = [];
      for (const assistantId of orderedCandidates) {
        const assistantIdx = assistantIndex.get(assistantId);
        if (assistantIdx === undefined) continue;

        const hasConflict = hasScheduleConflict(
          node.schedulesByAssistant,
          assistantId,
          event.inicioProgramadoMs,
          event.finProgramadoMs
        );
        if (hasConflict) continue;

        const nextLoadsByMonth = cloneLoadsByMonth(node.loadsByMonth);
        const monthLoads = [...(nextLoadsByMonth[event.monthKey] ?? [])];
        monthLoads[assistantIdx] = (monthLoads[assistantIdx] ?? 0) + event.coverageValue;
        nextLoadsByMonth[event.monthKey] = monthLoads;

        const nextAssignmentByEvent = [...node.assignmentByEvent];
        nextAssignmentByEvent[node.eventIndex] = assistantId;

        const nextSchedulesByAssistant: Record<string, Array<[number, number]>> = {
          ...node.schedulesByAssistant,
          [assistantId]: [
            ...(node.schedulesByAssistant[assistantId] ?? []),
            [event.inicioProgramadoMs, event.finProgramadoMs]
          ]
        };

        children.push({
          eventIndex: node.eventIndex + 1,
          loadsByMonth: nextLoadsByMonth,
          assignmentByEvent: nextAssignmentByEvent,
          schedulesByAssistant: nextSchedulesByAssistant
        });
      }

      for (let i = children.length - 1; i >= 0; i -= 1) {
        session.frontier.push(children[i]);
      }
    }

    return null;
  }

  async createMonthlyAssignmentSuggestion(
    admin: SessionUser,
    input?: { monthKey?: string | null }
  ) {
    const requestedMonth = input?.monthKey?.trim();
    if (requestedMonth) {
      parseMonthKeyOrThrow(requestedMonth);
    }

    const problem = await this.buildAssignmentSuggestionProblem();

    if (problem.unsatisfiedEvents.length > 0) {
      throw new Error(
        `No se puede sugerir cobertura para todos los eventos. Sin candidatos interesados: ${problem.unsatisfiedEvents.join(", ")}`
      );
    }

    if (problem.events.length === 0) {
      return {
        sessionId: null,
        scopeKey: problem.scopeKey,
        suggestion: null,
        message: "No hay eventos pendientes para sugerir."
      };
    }

    const sessionId = randomUUID();
    const now = new Date();
    const session: AssignmentSuggestionSessionValue = {
      version: 1,
      sessionId,
      createdByUserId: admin.id,
      scopeKey: problem.scopeKey,
      createdAtIso: now.toISOString(),
      expiresAtIso: new Date(now.getTime() + SUGGESTION_SESSION_TTL_MS).toISOString(),
      assistants: problem.assistants,
      events: problem.events,
      baseLoadsByMonth: problem.baseLoadsByMonth,
      targetScore: null,
      returnedSignatures: [],
      frontier: [
        {
          eventIndex: 0,
          loadsByMonth: cloneLoadsByMonth(problem.baseLoadsByMonth),
          assignmentByEvent: Array.from({ length: problem.events.length }, () => null),
          schedulesByAssistant: problem.baseSchedulesByAssistant
        }
      ]
    };

    const suggestion = this.findNextSuggestionFromSession(session);
    session.expiresAtIso = new Date(Date.now() + SUGGESTION_SESSION_TTL_MS).toISOString();
    await persistSuggestionSession(session);

    return {
      sessionId,
      scopeKey: problem.scopeKey,
      suggestion,
      message: suggestion ? null : "No se encontró una combinación válida para los eventos pendientes."
    };
  }

  async getNextMonthlyAssignmentSuggestion(admin: SessionUser, sessionId: string) {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId es obligatorio para solicitar otra sugerencia.");
    }

    const session = await loadSuggestionSession(normalizedSessionId);
    if (!session) {
      throw new Error("La sesión de sugerencias no existe o expiró.");
    }
    if (session.createdByUserId !== admin.id) {
      throw new Error("La sesión de sugerencias pertenece a otro usuario administrador.");
    }

    const suggestion = this.findNextSuggestionFromSession(session);
    session.expiresAtIso = new Date(Date.now() + SUGGESTION_SESSION_TTL_MS).toISOString();
    await persistSuggestionSession(session);

    return {
      sessionId: session.sessionId,
      scopeKey: session.scopeKey,
      suggestion,
      message: suggestion ? null : "No quedan sugerencias alternativas con el mismo puntaje." 
    };
  }

  async setInterest(
    user: SessionUser,
    eventoId: string,
    input: { estadoInteres: EstadoInteresAsistente; comentario?: string }
  ) {
    assertAssistantEligibleRole(user);
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
    await ensureAssistantProfilesForEligibleRoles();

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
            role: true,
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
    if (
      !LEGACY_ASSISTANT_ROLES.includes(selectedAssistant.usuario.role)
    ) {
      throw new Error("Solo se puede asignar personal con rol de asistencia Zoom.");
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

  async registerUpcomingMeetingInSystem(
    admin: SessionUser,
    input: {
      titulo: string;
      responsableNombre: string;
      programaNombre: string;
      modalidadReunion: ModalidadReunion;
      inicioProgramadoAt: string;
      finProgramadoAt: string;
      timezone?: string;
      zoomMeetingId?: string;
      zoomJoinUrl?: string;
      zoomAccountId?: string;
      zoomAccountEmail?: string;
      requiereAsistencia?: boolean;
      descripcion?: string;
    }
  ) {
    const titulo = input.titulo.trim();
    if (!titulo) {
      throw new Error("titulo es requerido.");
    }

    const responsableNombre = input.responsableNombre.trim();
    if (!responsableNombre) {
      throw new Error("responsableNombre es requerido.");
    }

    const programaNombre = input.programaNombre.trim();
    if (!programaNombre) {
      throw new Error("programaNombre es requerido.");
    }

    const start = toDate(input.inicioProgramadoAt, "inicioProgramadoAt");
    const end = toDate(input.finProgramadoAt, "finProgramadoAt");
    if (end <= start) {
      throw new Error("finProgramadoAt debe ser mayor que inicioProgramadoAt.");
    }
    if (end <= new Date()) {
      throw new Error(
        "La reunión ya finalizó. Para este caso corresponde registrar una reunion pasada."
      );
    }

    const meetingIdFromLink = extractZoomMeetingIdFromJoinUrl(input.zoomJoinUrl);
    const meetingId = normalizeZoomMeetingId(input.zoomMeetingId) ?? meetingIdFromLink;
    if (!meetingId) {
      throw new Error("Debes indicar un Zoom Meeting ID valido (o un link que lo contenga).");
    }

    const existingEvent = await db.eventoZoom.findUnique({
      where: { zoomMeetingId: meetingId },
      select: { id: true }
    });
    if (existingEvent) {
      throw new Error("Ese Zoom Meeting ID ya está registrado en el sistema.");
    }

    const normalizedZoomAccountId = input.zoomAccountId?.trim() ?? "";
    const normalizedZoomAccountEmail = input.zoomAccountEmail?.trim().toLowerCase() ?? "";

    const account =
      (normalizedZoomAccountId
        ? await resolveActiveCuentaZoomBySelector(normalizedZoomAccountId)
        : null) ??
      (normalizedZoomAccountEmail
        ? await resolveActiveCuentaZoomBySelector(normalizedZoomAccountEmail)
        : null);
    if (!account) {
      throw new Error(
        "No se pudo identificar la cuenta anfitriona de Zoom en el sistema. Revisa la cuenta seleccionada."
      );
    }

    const docente = await getOrCreateDocente(admin);
    const timezone = input.timezone?.trim() || "America/Montevideo";
    const requiereAsistencia = input.requiereAsistencia ?? false;
    const baseDurationMinutes = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const joinUrl = input.zoomJoinUrl?.trim() || buildZoomJoinUrlFromMeetingId(meetingId);
    let instancePlans: Array<{ inicio: Date; fin: Date; joinUrl: string }> = [
      {
        inicio: start,
        fin: end,
        joinUrl
      }
    ];

    try {
      const zoomClient = await ZoomMeetingsClient.fromAccountCredentials();
      const snapshot = await fetchZoomMeetingSnapshot(zoomClient, meetingId);
      if (snapshot && snapshot.instances.length > 0) {
        const mappedFromZoom = snapshot.instances
          .map((instance) => {
            if (instance.status === "deleted" || instance.estadoEvento === EstadoEventoZoom.CANCELADO) {
              return null;
            }
            const inicio = new Date(instance.startTime);
            if (Number.isNaN(inicio.getTime())) return null;
            const durationMinutes = Math.max(1, instance.durationMinutes || baseDurationMinutes);
            const fin = new Date(inicio.getTime() + durationMinutes * 60_000);
            return {
              inicio,
              fin,
              joinUrl: instance.joinUrl ?? snapshot.joinUrl ?? joinUrl
            };
          })
          .filter((item): item is { inicio: Date; fin: Date; joinUrl: string } => item !== null)
          .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

        const dedupedFromZoom: Array<{ inicio: Date; fin: Date; joinUrl: string }> = [];
        const seen = new Set<number>();
        for (const item of mappedFromZoom) {
          const key = item.inicio.getTime();
          if (seen.has(key)) continue;
          seen.add(key);
          dedupedFromZoom.push(item);
        }

        if (dedupedFromZoom.length > 0) {
          instancePlans = dedupedFromZoom;
        }
      }
    } catch (error) {
      logger.warn("No se pudieron leer ocurrencias de Zoom para registro en sistema; se usa la instancia seleccionada.", {
        meetingId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    const firstInstance = instancePlans[0] ?? { inicio: start, fin: end, joinUrl };
    const lastInstance = instancePlans[instancePlans.length - 1] ?? firstInstance;
    const totalInstances = instancePlans.length;
    const hasMultipleInstances = totalInstances > 1;
    const fechasInstancias = hasMultipleInstances
      ? instancePlans.map((plan) => plan.inicio.toISOString())
      : undefined;
    const motivoAsistencia = requiereAsistencia
      ? "Asistencia solicitada en registro administrativo de reunión ya programada en Zoom."
      : null;

    const result = await db.$transaction(async (tx) => {
      const solicitud = await tx.solicitudSala.create({
        data: {
          docenteId: docente.id,
          createdByUserId: admin.id,
          cuentaZoomAsignadaId: account.id,
          titulo,
          responsableNombre,
          programaNombre,
          descripcion:
            input.descripcion?.trim() ||
            "Registro administrativo de reunión detectada en Zoom (sin reprovisionar).",
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: hasMultipleInstances
            ? TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM
            : TipoInstancias.UNICA,
          meetingIdEstrategia: MeetingIdEstrategia.UNICO_PREFERIDO,
          meetingPrincipalId: meetingId,
          fechaInicioSolicitada: firstInstance.inicio,
          fechaFinSolicitada: firstInstance.fin,
          fechaFinRecurrencia: hasMultipleInstances ? lastInstance.inicio : null,
          timezone,
          requiereAsistencia,
          motivoAsistencia,
          fechasInstancias,
          cantidadInstancias: totalInstances,
          estadoSolicitud: EstadoSolicitudSala.PROVISIONADA
        }
      });

      const firstEvent = await tx.eventoZoom.create({
        data: {
          solicitudSalaId: solicitud.id,
          cuentaZoomId: account.id,
          tipoEvento: hasMultipleInstances
            ? TipoEventoZoom.RECURRENCE_INSTANCE
            : TipoEventoZoom.SINGLE,
          grupoRecurrenciaId: hasMultipleInstances ? solicitud.id : null,
          modalidadReunion: input.modalidadReunion,
          inicioProgramadoAt: firstInstance.inicio,
          finProgramadoAt: firstInstance.fin,
          timezone,
          requiereAsistencia,
          estadoCobertura: requiereAsistencia
            ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
            : EstadoCoberturaSoporte.NO_REQUIERE,
          agendaAbiertaAt: requiereAsistencia ? new Date() : null,
          agendaCierraAt: requiereAsistencia
            ? new Date(firstInstance.inicio.getTime() - 24 * 60 * 60000)
            : null,
          estadoEvento: EstadoEventoZoom.PROGRAMADO,
          zoomMeetingId: meetingId,
          zoomJoinUrl: firstInstance.joinUrl ?? joinUrl,
          sincronizadoConZoomAt: new Date(),
          costoEstimado: calculateEstimatedCost(
            Math.max(
              1,
              Math.floor((firstInstance.fin.getTime() - firstInstance.inicio.getTime()) / 60000)
            ),
            0
          )
        }
      });

      if (instancePlans.length > 1) {
        await tx.eventoZoom.createMany({
          data: instancePlans.slice(1).map((plan) => ({
            solicitudSalaId: solicitud.id,
            cuentaZoomId: account.id,
            tipoEvento: TipoEventoZoom.RECURRENCE_INSTANCE,
            grupoRecurrenciaId: solicitud.id,
            modalidadReunion: input.modalidadReunion,
            inicioProgramadoAt: plan.inicio,
            finProgramadoAt: plan.fin,
            timezone,
            requiereAsistencia,
            estadoCobertura: requiereAsistencia
              ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
              : EstadoCoberturaSoporte.NO_REQUIERE,
            agendaAbiertaAt: requiereAsistencia ? new Date() : null,
            agendaCierraAt: requiereAsistencia
              ? new Date(plan.inicio.getTime() - 24 * 60 * 60000)
              : null,
            estadoEvento: EstadoEventoZoom.PROGRAMADO,
            zoomMeetingId: null,
            zoomJoinUrl: plan.joinUrl ?? joinUrl,
            sincronizadoConZoomAt: new Date(),
            costoEstimado: calculateEstimatedCost(
              Math.max(1, Math.floor((plan.fin.getTime() - plan.inicio.getTime()) / 60000)),
              0
            )
          }))
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "REGISTRO_MANUAL_REUNION_PROXIMA",
          entidadTipo: "EventoZoom",
          entidadId: firstEvent.id,
          valorNuevo: {
            solicitudId: solicitud.id,
            meetingId,
            zoomAccountId: account.id,
            requiereAsistencia,
            cantidadInstancias: totalInstances
          }
        }
      });

      return {
        solicitudId: solicitud.id,
        eventoId: firstEvent.id
      };
    });

    await notifyAdminTelegramMovement({
      action: "REGISTRO_MANUAL_REUNION_PROXIMA",
      actorEmail: admin.email,
      actorRole: admin.role,
      entityType: "EventoZoom",
      entityId: result.eventoId,
      summary: `${titulo} (${meetingId})`,
      details: {
        solicitudId: result.solicitudId,
        zoomAccount: account.ownerEmail ?? account.nombreCuenta ?? account.id,
        requiereAsistencia
      }
    });

    if (requiereAsistencia) {
      await sendMonitoringRequiredEmailToAssistantPool({
        solicitudId: result.solicitudId,
        titulo,
        modalidad: input.modalidadReunion,
        programaNombre: programaNombre || null,
        responsableNombre: responsableNombre || null,
        timezone,
        instanceStarts: instancePlans.map((plan) => plan.inicio),
        estadoSolicitud: EstadoSolicitudSala.PROVISIONADA
      }).catch((error) => {
        logger.warn("No se pudo enviar correo al pool de asistentes Zoom (registro manual proxima).", {
          solicitudId: result.solicitudId,
          error: error instanceof Error ? error.message : String(error)
        });
      });
    }

    return result;
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
    if (!LEGACY_ASSISTANT_ROLES.includes(monitorUser.role)) {
      throw new Error("El usuario de monitoreo debe tener rol de Asistente Zoom.");
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

  async buildMonthlyAccountingWorkbook(input: { monthKey?: string | null }) {
    const requestedMonthKey = (input.monthKey ?? "").trim();
    const defaultMonthKey = toMonthKey(new Date(), "America/Montevideo");
    const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonthKey)
      ? requestedMonthKey
      : defaultMonthKey;

    const [yearRaw = "0", monthRaw = "1"] = monthKey.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const queryStart = new Date(monthStart.getTime() - 48 * 60 * 60 * 1000);
    const queryEnd = new Date(nextMonthStart.getTime() + 48 * 60 * 60 * 1000);

    const rates = await this.listTarifas();
    const virtualRate = rates.find((rate) => rate.modalidadReunion === ModalidadReunion.VIRTUAL) ?? null;
    const hibridaRate = rates.find((rate) => rate.modalidadReunion === ModalidadReunion.HIBRIDA) ?? null;

    const ratesByModalidad: Record<ModalidadReunion, { valorHora: number; moneda: string }> = {
      [ModalidadReunion.VIRTUAL]: {
        valorHora: Number(virtualRate?.valorHora ?? 0),
        moneda: virtualRate?.moneda ?? ""
      },
      [ModalidadReunion.HIBRIDA]: {
        valorHora: Number(hibridaRate?.valorHora ?? 0),
        moneda: hibridaRate?.moneda ?? ""
      }
    };

    const assignments = await db.asignacionAsistente.findMany({
      where: {
        tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
        estadoAsignacion: {
          in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO]
        },
        asistente: {
          usuario: {
            role: { in: [...LEGACY_ASSISTANT_ROLES] }
          }
        },
        evento: {
          requiereAsistencia: true,
          estadoEjecucion: EstadoEjecucionEvento.EJECUTADO,
          estadoEvento: { not: EstadoEventoZoom.CANCELADO },
          inicioProgramadoAt: {
            gte: queryStart,
            lt: queryEnd
          }
        }
      },
      select: {
        id: true,
        asistenteZoomId: true,
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
        },
        evento: {
          select: {
            modalidadReunion: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            inicioRealAt: true,
            finRealAt: true,
            minutosReales: true,
            timezone: true,
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
          inicioProgramadoAt: "asc"
        }
      }
    });

    type DetailRow = {
      assistantId: string;
      assistantName: string;
      assistantEmail: string;
      programaNombre: string;
      titulo: string;
      inicio: Date;
      fin: Date;
      timeZone: string;
      modalidad: ModalidadReunion;
      minutos: number;
      horas: number;
      tarifaHora: number;
      moneda: string;
      monto: number;
    };

    type AssistantSummary = {
      assistantId: string;
      assistantName: string;
      assistantEmail: string;
      minutosVirtuales: number;
      minutosHibridas: number;
      montoVirtual: number;
      montoHibrida: number;
    };

    const details: DetailRow[] = [];
    const summaryByAssistant = new Map<string, AssistantSummary>();
    const minutesByModalidad: Record<ModalidadReunion, number> = {
      [ModalidadReunion.VIRTUAL]: 0,
      [ModalidadReunion.HIBRIDA]: 0
    };
    const amountByModalidad: Record<ModalidadReunion, number> = {
      [ModalidadReunion.VIRTUAL]: 0,
      [ModalidadReunion.HIBRIDA]: 0
    };

    const getBillableMinutes = (event: {
      inicioProgramadoAt: Date;
      finProgramadoAt: Date;
      inicioRealAt: Date | null;
      finRealAt: Date | null;
      minutosReales: number | null;
    }): number => {
      const scheduledMinutes = Math.max(
        0,
        Math.round((event.finProgramadoAt.getTime() - event.inicioProgramadoAt.getTime()) / 60000)
      );
      const realMinutes =
        event.minutosReales ??
        Math.max(
          0,
          Math.round(
            (
              (event.finRealAt ?? event.finProgramadoAt).getTime() -
              (event.inicioRealAt ?? event.inicioProgramadoAt).getTime()
            ) /
              60000
          )
        );
      return scheduledMinutes > 0 ? scheduledMinutes : realMinutes;
    };

    const round2 = (value: number) => Math.round(value * 100) / 100;

    for (const assignment of assignments) {
      const timezone = assignment.evento.timezone || "America/Montevideo";
      if (toMonthKey(assignment.evento.inicioProgramadoAt, timezone) !== monthKey) {
        continue;
      }

      const assistant = assignment.asistente?.usuario;
      const assistantName =
        assistant?.name ||
        [assistant?.firstName, assistant?.lastName].filter(Boolean).join(" ").trim() ||
        assistant?.email ||
        assignment.asistenteZoomId;
      const assistantEmail = assistant?.email ?? "";
      const modalidad = assignment.evento.modalidadReunion;
      const rateInfo = ratesByModalidad[modalidad];
      const billableMinutes = getBillableMinutes(assignment.evento);
      const billableHours = round2(billableMinutes / 60);
      const calculatedAmount = round2((billableMinutes / 60) * rateInfo.valorHora);

      details.push({
        assistantId: assignment.asistenteZoomId,
        assistantName,
        assistantEmail,
        programaNombre: assignment.evento.solicitud.programaNombre ?? "",
        titulo: assignment.evento.solicitud.titulo,
        inicio: assignment.evento.inicioProgramadoAt,
        fin: assignment.evento.finProgramadoAt,
        timeZone: timezone,
        modalidad,
        minutos: billableMinutes,
        horas: billableHours,
        tarifaHora: rateInfo.valorHora,
        moneda: rateInfo.moneda,
        monto: calculatedAmount
      });

      minutesByModalidad[modalidad] += billableMinutes;
      amountByModalidad[modalidad] += calculatedAmount;

      const existing = summaryByAssistant.get(assignment.asistenteZoomId);
      if (existing) {
        if (modalidad === ModalidadReunion.VIRTUAL) {
          existing.minutosVirtuales += billableMinutes;
          existing.montoVirtual = round2(existing.montoVirtual + calculatedAmount);
        } else {
          existing.minutosHibridas += billableMinutes;
          existing.montoHibrida = round2(existing.montoHibrida + calculatedAmount);
        }
      } else {
        summaryByAssistant.set(assignment.asistenteZoomId, {
          assistantId: assignment.asistenteZoomId,
          assistantName,
          assistantEmail,
          minutosVirtuales: modalidad === ModalidadReunion.VIRTUAL ? billableMinutes : 0,
          minutosHibridas: modalidad === ModalidadReunion.HIBRIDA ? billableMinutes : 0,
          montoVirtual: modalidad === ModalidadReunion.VIRTUAL ? calculatedAmount : 0,
          montoHibrida: modalidad === ModalidadReunion.HIBRIDA ? calculatedAmount : 0
        });
      }
    }

    details.sort((left, right) => {
      if (left.assistantName !== right.assistantName) {
        return left.assistantName.localeCompare(right.assistantName, "es");
      }
      return left.inicio.getTime() - right.inicio.getTime();
    });

    const assistantSummaries = Array.from(summaryByAssistant.values())
      .map((assistant) => {
        const minutosTotales = assistant.minutosVirtuales + assistant.minutosHibridas;
        const montoTotal = round2(assistant.montoVirtual + assistant.montoHibrida);
        return {
          ...assistant,
          minutosTotales,
          horasVirtuales: round2(assistant.minutosVirtuales / 60),
          horasHibridas: round2(assistant.minutosHibridas / 60),
          horasTotales: round2(minutosTotales / 60),
          montoTotal
        };
      })
      .sort((left, right) => left.assistantName.localeCompare(right.assistantName, "es"));

    const totalMinutes = minutesByModalidad.VIRTUAL + minutesByModalidad.HIBRIDA;
    const totalAmount = round2(amountByModalidad.VIRTUAL + amountByModalidad.HIBRIDA);
    const totalHours = round2(totalMinutes / 60);
    const virtualCurrency = ratesByModalidad.VIRTUAL.moneda;
    const hibridaCurrency = ratesByModalidad.HIBRIDA.moneda;
    const hasMixedCurrencies = Boolean(
      virtualCurrency &&
      hibridaCurrency &&
      virtualCurrency !== hibridaCurrency
    );
    const totalCurrency = hasMixedCurrencies
      ? "MIXTA"
      : (virtualCurrency || hibridaCurrency || "");

    const formatNumber = (value: number) => Number(value.toFixed(2));
    const formatHours = (minutes: number) => formatNumber(minutes / 60);
    const formatDateTime = (date: Date, timeZone: string) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone
      }).formatToParts(date);
      const yearPart = parts.find((part) => part.type === "year")?.value ?? "0000";
      const monthPart = parts.find((part) => part.type === "month")?.value ?? "01";
      const dayPart = parts.find((part) => part.type === "day")?.value ?? "01";
      const hourPart = parts.find((part) => part.type === "hour")?.value ?? "00";
      const minutePart = parts.find((part) => part.type === "minute")?.value ?? "00";
      return `${yearPart}-${monthPart}-${dayPart} ${hourPart}:${minutePart}`;
    };
    const overviewRows: Array<Array<string | number>> = [
      ["INFORME MENSUAL CONTADURIA", ""],
      ["Mes", monthKey],
      ["Generado", formatDateTime(new Date(), "America/Montevideo")],
      ["Tarifa virtual actual", formatNumber(ratesByModalidad.VIRTUAL.valorHora), virtualCurrency],
      ["Tarifa hibrida actual", formatNumber(ratesByModalidad.HIBRIDA.valorHora), hibridaCurrency],
      ["Moneda total", totalCurrency]
    ];
    if (hasMixedCurrencies) {
      overviewRows.push(["Observacion", "Hay modalidades con monedas distintas."]);
    }

    const summaryRows = assistantSummaries.map((assistant) => ({
      Asistente: assistant.assistantName,
      Email: assistant.assistantEmail,
      "Horas virtuales": formatNumber(assistant.horasVirtuales),
      "Horas hibridas": formatNumber(assistant.horasHibridas),
      "Horas totales": formatNumber(assistant.horasTotales),
      "Monto virtual": formatNumber(assistant.montoVirtual),
      "Monto hibrida": formatNumber(assistant.montoHibrida),
      "Monto total": formatNumber(assistant.montoTotal),
      Moneda: totalCurrency
    }));

    const detailRows = details.map((detail) => ({
      Asistente: detail.assistantName,
      Email: detail.assistantEmail,
      Programa: detail.programaNombre || "Sin programa",
      Encuentro: detail.titulo,
      Inicio: formatDateTime(detail.inicio, detail.timeZone),
      Fin: formatDateTime(detail.fin, detail.timeZone),
      Modalidad: detail.modalidad,
      "Duracion (min)": detail.minutos,
      "Duracion (h)": formatNumber(detail.horas),
      "Tarifa hora actual": formatNumber(detail.tarifaHora),
      Moneda: detail.moneda,
      "Importe calculado": formatNumber(detail.monto)
    }));

    const totalsRows = [
      {
        Modalidad: "VIRTUAL",
        Horas: formatHours(minutesByModalidad.VIRTUAL),
        Monto: formatNumber(amountByModalidad.VIRTUAL),
        Moneda: virtualCurrency
      },
      {
        Modalidad: "HIBRIDA",
        Horas: formatHours(minutesByModalidad.HIBRIDA),
        Monto: formatNumber(amountByModalidad.HIBRIDA),
        Moneda: hibridaCurrency
      },
      {
        Modalidad: "TOTAL",
        Horas: formatNumber(totalHours),
        Monto: formatNumber(totalAmount),
        Moneda: totalCurrency
      }
    ];

    const workbook = XLSX.utils.book_new();
    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    const totalsSheet = XLSX.utils.json_to_sheet(totalsRows);

    XLSX.utils.book_append_sheet(workbook, overviewSheet, "Resumen");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Asistentes");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalle");
    XLSX.utils.book_append_sheet(workbook, totalsSheet, "Totales");

    const content = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return {
      monthKey,
      fileName: `informe-contaduria-${monthKey}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content
    };
  }

  async getZoomAccountPassword(input: { hostAccount?: string | null }) {
    const hostAccount = normalizeZoomHostAccountLabel(input.hostAccount);
    if (!hostAccount) {
      throw new Error("Cuenta Zoom invalida.");
    }

    const password = await getAccountPasswordFromWebhook(hostAccount);
    return {
      hostAccount,
      password
    };
  }

  async listPersonMeetingHours(input: { userId?: string | null }) {
    const peopleRows = await db.user.findMany({
      where: {
        role: { in: [...LEGACY_ASSISTANT_ROLES] }
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

    const now = new Date();

    const buildMeetingFromAssignment = (assignment: {
      id: string;
      estadoAsignacion: EstadoAsignacion;
      evento: {
        id: string;
        solicitudSalaId: string;
        modalidadReunion: ModalidadReunion;
        inicioProgramadoAt: Date;
        finProgramadoAt: Date;
        inicioRealAt: Date | null;
        finRealAt: Date | null;
        minutosReales: number | null;
        estadoEvento: EstadoEventoZoom;
        estadoEjecucion: EstadoEjecucionEvento;
        timezone: string;
        zoomMeetingId: string | null;
        zoomJoinUrl: string | null;
        zoomPayloadUltimo: Prisma.JsonValue | null;
        cuentaZoom: {
          ownerEmail: string;
          nombreCuenta: string;
        } | null;
        solicitud: {
          titulo: string;
          programaNombre: string | null;
          requiereGrabacion: boolean;
        };
      };
    }) => {
      const event = assignment.evento;
      const scheduledStart = event.inicioProgramadoAt;
      const scheduledEnd = event.finProgramadoAt;
      const realStart = event.inicioRealAt;
      const realEnd = event.finRealAt;
      const completionReferenceEnd = realEnd ?? scheduledEnd;

      const scheduledDurationMinutes = Math.max(
        1,
        Math.floor((scheduledEnd.getTime() - scheduledStart.getTime()) / 60000)
      );
      const durationByRealRange =
        realStart && realEnd
          ? Math.max(1, Math.floor((realEnd.getTime() - realStart.getTime()) / 60000))
          : null;
      const rawRealDuration = event.minutosReales ?? durationByRealRange;
      const realDurationMinutes =
        rawRealDuration === null || !Number.isFinite(rawRealDuration) || rawRealDuration <= 0
          ? null
          : Math.max(1, Math.floor(rawRealDuration));
      const billableDurationMinutes = scheduledDurationMinutes;
      const extraNonBillableMinutes =
        realDurationMinutes === null
          ? 0
          : Math.max(0, realDurationMinutes - scheduledDurationMinutes);
      const requiresAdminReviewByOverrun = extraNonBillableMinutes >= 60;
      const recordingRequested = Boolean(event.solicitud.requiereGrabacion);
      const recordingDetected = detectRecordingFromZoomPayload(event.zoomPayloadUltimo);
      const hadRecording =
        recordingDetected !== null
          ? recordingDetected
          : recordingRequested
            ? null
            : false;

      const isCompleted =
        event.estadoEvento !== EstadoEventoZoom.CANCELADO &&
        (
          event.estadoEjecucion === EstadoEjecucionEvento.EJECUTADO ||
          (
            completionReferenceEnd <= now &&
            event.estadoEjecucion !== EstadoEjecucionEvento.NO_REALIZADO
          )
        );
      const zoomAccountEmail = event.cuentaZoom?.ownerEmail ?? null;
      const zoomAccountName = event.cuentaZoom?.nombreCuenta ?? null;
      const zoomHostAccount = pickZoomHostAccountLabel(zoomAccountEmail, zoomAccountName);

      return {
        assignmentId: assignment.id,
        eventId: event.id,
        solicitudId: event.solicitudSalaId,
        titulo: event.solicitud.titulo,
        programaNombre: event.solicitud.programaNombre ?? null,
        modalidadReunion: event.modalidadReunion,
        inicioAt: scheduledStart.toISOString(),
        finAt: scheduledEnd.toISOString(),
        inicioProgramadoAt: scheduledStart.toISOString(),
        finProgramadoAt: scheduledEnd.toISOString(),
        inicioRealAt: realStart ? realStart.toISOString() : null,
        finRealAt: realEnd ? realEnd.toISOString() : null,
        minutosProgramados: scheduledDurationMinutes,
        minutosReales: realDurationMinutes,
        minutosExtraNoLiquidados: extraNonBillableMinutes,
        requiereRevisionAdminPorExceso: requiresAdminReviewByOverrun,
        requiereGrabacion: recordingRequested,
        huboGrabacion: hadRecording,
        minutos: billableDurationMinutes,
        estadoEvento: event.estadoEvento,
        estadoEjecucion: event.estadoEjecucion,
        estadoAsignacion: assignment.estadoAsignacion,
        zoomMeetingId: event.zoomMeetingId,
        zoomJoinUrl: event.zoomJoinUrl,
        zoomAccountEmail,
        zoomAccountName,
        zoomHostAccount,
        isCompleted,
        timezone: event.timezone || "America/Montevideo"
      };
    };

    const buildMonthSummaries = (
      completedMeetings: Array<{
        inicioAt: string;
        minutos: number;
        timezone: string;
        requiereRevisionAdminPorExceso: boolean;
      }>
    ) => {
      const monthAccumulator = new Map<string, {
        monthKey: string;
        year: number;
        month: number;
        meetingsCount: number;
        totalMinutes: number;
        overrunAlerts: number;
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
          totalMinutes: 0,
          overrunAlerts: 0
        };
        current.meetingsCount += 1;
        current.totalMinutes += meeting.minutos;
        if (meeting.requiereRevisionAdminPorExceso) {
          current.overrunAlerts += 1;
        }
        monthAccumulator.set(monthKey, current);
      }

      return Array.from(monthAccumulator.values())
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        .map((item) => ({
          ...item,
          totalHours: Math.round((item.totalMinutes / 60) * 100) / 100
        }));
    };

    const selectedUserHasProfile = Boolean(selectedUserId && selectedPerson?.hasAssistantProfile);
    let meetings: Array<{
      assignmentId: string;
      eventId: string;
      solicitudId: string;
      titulo: string;
      programaNombre: string | null;
      modalidadReunion: ModalidadReunion;
      inicioAt: string;
      finAt: string;
      inicioProgramadoAt: string;
      finProgramadoAt: string;
      inicioRealAt: string | null;
      finRealAt: string | null;
      minutosProgramados: number;
      minutosReales: number | null;
      minutosExtraNoLiquidados: number;
      requiereRevisionAdminPorExceso: boolean;
      requiereGrabacion: boolean;
      huboGrabacion: boolean | null;
      minutos: number;
      estadoEvento: EstadoEventoZoom;
      estadoEjecucion: EstadoEjecucionEvento;
      estadoAsignacion: EstadoAsignacion;
      zoomMeetingId: string | null;
      zoomJoinUrl: string | null;
      zoomAccountEmail: string | null;
      zoomAccountName: string | null;
      zoomHostAccount: string | null;
      isCompleted: boolean;
      timezone: string;
    }> = [];

    if (selectedUserHasProfile && selectedUserId) {
      const assignments = await db.asignacionAsistente.findMany({
        where: {
          tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
          estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] },
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
              zoomPayloadUltimo: true,
              cuentaZoom: {
                select: {
                  ownerEmail: true,
                  nombreCuenta: true
                }
              },
              solicitud: {
                select: {
                  titulo: true,
                  programaNombre: true,
                  requiereGrabacion: true
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

      meetings = assignments.map((assignment) => buildMeetingFromAssignment(assignment));
    }

    const completedMeetings = meetings.filter((meeting) => meeting.isCompleted);
    const monthSummaries = buildMonthSummaries(completedMeetings);
    const completedMinutesTotal = completedMeetings.reduce((acc, meeting) => acc + meeting.minutos, 0);

    const completedAssignmentsAll = await db.asignacionAsistente.findMany({
      where: {
        tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
        estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] },
        asistente: {
          usuario: {
            role: { in: [...LEGACY_ASSISTANT_ROLES] }
          }
        }
      },
      select: {
        id: true,
        estadoAsignacion: true,
        asistente: {
          select: {
            usuarioId: true
          }
        },
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
            zoomPayloadUltimo: true,
            cuentaZoom: {
              select: {
                ownerEmail: true,
                nombreCuenta: true
              }
            },
            solicitud: {
              select: {
                titulo: true,
                programaNombre: true,
                requiereGrabacion: true
              }
            }
          }
        }
      }
    });

    const completedMeetingsAll = completedAssignmentsAll
      .map((assignment) => ({
        userId: assignment.asistente.usuarioId,
        meeting: buildMeetingFromAssignment(assignment)
      }))
      .filter((item) => item.meeting.isCompleted);

    const monthKeysSet = new Set<string>();
    const monthMapByUser = new Map<string, Map<string, {
      monthKey: string;
      year: number;
      month: number;
      meetingsCount: number;
      totalMinutes: number;
      totalHours: number;
      overrunAlerts: number;
    }>>();

    for (const item of completedMeetingsAll) {
      const monthKey = toMonthKey(new Date(item.meeting.inicioAt), item.meeting.timezone);
      monthKeysSet.add(monthKey);

      const [yearRaw = "0", monthRaw = "0"] = monthKey.split("-");
      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const userMonths = monthMapByUser.get(item.userId) ?? new Map<string, {
        monthKey: string;
        year: number;
        month: number;
        meetingsCount: number;
        totalMinutes: number;
        totalHours: number;
        overrunAlerts: number;
      }>();
      const current = userMonths.get(monthKey) ?? {
        monthKey,
        year,
        month,
        meetingsCount: 0,
        totalMinutes: 0,
        totalHours: 0,
        overrunAlerts: 0
      };
      current.meetingsCount += 1;
      current.totalMinutes += item.meeting.minutos;
      current.totalHours = Math.round((current.totalMinutes / 60) * 100) / 100;
      if (item.meeting.requiereRevisionAdminPorExceso) {
        current.overrunAlerts += 1;
      }
      userMonths.set(monthKey, current);
      monthMapByUser.set(item.userId, userMonths);
    }

    const availableMonthKeys = Array.from(monthKeysSet.values()).sort((a, b) => b.localeCompare(a));
    const assistantSummaries = people
      .map((person) => {
        const months = Array.from((monthMapByUser.get(person.userId) ?? new Map()).values())
          .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
        const totalCompletedMinutes = months.reduce((acc, month) => acc + month.totalMinutes, 0);
        const totalCompletedMeetings = months.reduce((acc, month) => acc + month.meetingsCount, 0);
        const totalOverrunAlerts = months.reduce((acc, month) => acc + month.overrunAlerts, 0);
        const totalCompletedHours = Math.round((totalCompletedMinutes / 60) * 100) / 100;
        return {
          userId: person.userId,
          email: person.email,
          role: person.role,
          nombre: person.nombre,
          hasAssistantProfile: person.hasAssistantProfile,
          totalCompletedMeetings,
          totalCompletedMinutes,
          totalCompletedHours,
          totalOverrunAlerts,
          months
        };
      })
      .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));

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
      meetings: meetings.map(({ timezone: _timezone, ...meeting }) => meeting),
      availableMonthKeys,
      assistantSummaries
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
