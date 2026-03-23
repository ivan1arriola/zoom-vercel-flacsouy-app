import {
  CuentaZoom,
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
  occurrenceId: string | null;
  startTime: string;
  durationMinutes: number;
  status: string | null;
  joinUrl: string | null;
};

type ZoomMeetingSnapshot = {
  meetingId: string;
  joinUrl: string | null;
  startUrl: string | null;
  timezone: string | null;
  instances: ZoomOccurrenceSnapshot[];
  rawPayload: Prisma.InputJsonValue | undefined;
};

type ProvisionedEventPlan = {
  inicio: Date;
  fin: Date;
  joinUrl: string | null;
  zoomMeetingId: string | null;
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

function parseZoomMeetingSnapshot(data: Record<string, unknown>): ZoomMeetingSnapshot {
  const rawId = data.id;
  const meetingId = normalizeZoomMeetingId(rawId != null ? String(rawId) : null);
  if (!meetingId) {
    throw new Error("Zoom no devolvio un meeting ID valido.");
  }

  const joinUrl = typeof data.join_url === "string" ? data.join_url : null;
  const startUrl = typeof data.start_url === "string" ? data.start_url : null;
  const timezone = typeof data.timezone === "string" ? data.timezone : null;
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
    const joinUrlForOccurrence =
      joinUrl && occurrenceId
        ? `${joinUrl}${joinUrl.includes("?") ? "&" : "?"}occurrence_id=${encodeURIComponent(occurrenceId)}`
        : joinUrl;

    instances.push({
      occurrenceId,
      startTime: parsedStart.toISOString(),
      durationMinutes,
      status,
      joinUrl: joinUrlForOccurrence
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
          durationMinutes: defaultDuration,
          status: typeof data.status === "string" ? data.status : null,
          joinUrl
        });
      }
    }
  }

  return {
    meetingId,
    joinUrl,
    startUrl,
    timezone,
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
  if (endTimes != null) payload.end_times = endTimes;
  if (typeof zoomRecurrence.end_date_time === "string" && zoomRecurrence.end_date_time.trim()) {
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
  const recurrence = buildZoomRecurrencePayload(input);

  const payload: Record<string, unknown> = {
    topic: input.titulo,
    type: meetingType,
    start_time: start.toISOString(),
    duration: durationMinutes,
    timezone,
    agenda: input.descripcion ?? undefined,
    settings: {
      approval_type: 2,
      registration_type: 1,
      waiting_room: false,
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

  if (currentAutoRecording !== desiredAutoRecording) {
    await zoomClient
      .updateMeeting(createdSnapshot.meetingId, {
        settings: {
          waiting_room: false,
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
        zoomMeetingId: index === 0 ? zoomSnapshot?.meetingId ?? null : null
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
          zoomMeetingId: index === 0 ? zoomSnapshot.meetingId : null
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
  return aStart < bEnd && aEnd > bStart;
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

  const candidates: CuentaZoom[] = [];
  for (const account of activeAccounts) {
    const concurrentLimit =
      account.limiteEventosConcurrentes && account.limiteEventosConcurrentes > 0
        ? account.limiteEventosConcurrentes
        : 1;

    const overlappingEvents = await db.eventoZoom.findMany({
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
        finProgramadoAt: true
      }
    });

    let supportsAllInstances = true;
    for (const window of windows) {
      let concurrentCount = 0;
      for (const existing of overlappingEvents) {
        if (
          hasTimeOverlap(window.start, window.end, existing.inicioProgramadoAt, existing.finProgramadoAt)
        ) {
          concurrentCount += 1;
          if (concurrentCount >= concurrentLimit) {
            supportsAllInstances = false;
            break;
          }
        }
      }
      if (!supportsAllInstances) break;
    }

    if (supportsAllInstances) {
      candidates.push(account);
    }
  }

  return candidates;
}

function zoomSnapshotSupportsAllRequestedInstances(
  zoomSnapshot: ZoomMeetingSnapshot,
  requestedPlans: InstancePlan[]
): boolean {
  if (requestedPlans.length <= 1) return true;

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
    if (endTimes !== null && Number.isInteger(endTimes) && endTimes < requestedPlans.length) {
      return false;
    }

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
  const hasEndDateTime = zoomRecurrence.end_date_time !== undefined && zoomRecurrence.end_date_time !== null;
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
      user.role === UserRole.CONTADURIA ||
      user.role === UserRole.ASISTENTE_ZOOM ||
      user.role === UserRole.SOPORTE_ZOOM;

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
            estadoCobertura: true,
            zoomMeetingId: true,
            zoomJoinUrl: true
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

      let fallbackInstances: ZoomOccurrenceSnapshot[] = solicitud.eventos.map((event) => ({
        occurrenceId: null,
        startTime: event.inicioProgramadoAt.toISOString(),
        durationMinutes: Math.max(
          1,
          Math.floor((event.finProgramadoAt.getTime() - event.inicioProgramadoAt.getTime()) / 60000)
        ),
        status: null,
        joinUrl: event.zoomJoinUrl ?? null
      }));

      if (fallbackInstances.length === 0 && Array.isArray(solicitud.fechasInstancias)) {
        fallbackInstances = solicitud.fechasInstancias
          .map((item) => {
            if (typeof item !== "string") return undefined;
            const date = new Date(item);
            if (Number.isNaN(date.getTime())) return undefined;
            return {
              occurrenceId: null,
              startTime: date.toISOString(),
              durationMinutes: Math.max(
                1,
                Math.floor((solicitud.fechaFinSolicitada.getTime() - solicitud.fechaInicioSolicitada.getTime()) / 60000)
              ),
              status: null,
              joinUrl: null
            } as ZoomOccurrenceSnapshot;
          })
          .filter((item): item is ZoomOccurrenceSnapshot => item !== undefined);
      }

      const snapshotInstances = snapshot?.instances ?? [];
      const fallbackInstancesEnriched = fallbackInstances.map((instance, index) => ({
        ...instance,
        joinUrl:
          instance.joinUrl ??
          snapshotInstances[index]?.joinUrl ??
          snapshot?.joinUrl ??
          null
      }));

      const zoomInstances =
        fallbackInstancesEnriched.length >= snapshotInstances.length && fallbackInstancesEnriched.length > 0
          ? fallbackInstancesEnriched
          : snapshotInstances;
      const zoomJoinUrl =
        snapshot?.joinUrl ??
        fallbackInstancesEnriched.find((event) => event.joinUrl)?.joinUrl ??
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
    const docente = await getOrCreateDocente(user);
    const start = toDate(input.fechaInicioSolicitada, "fechaInicioSolicitada");
    const end = toDate(input.fechaFinSolicitada, "fechaFinSolicitada");
    const recurrenceEnd = input.fechaFinRecurrencia
      ? toDate(input.fechaFinRecurrencia, "fechaFinRecurrencia")
      : null;
    const grabacionPreferencia = input.grabacionPreferencia ?? "NO";
    const requiereGrabacion =
      input.requiereGrabacion ?? grabacionPreferencia === "SI";

    if (end <= start) {
      throw new Error("fechaFinSolicitada debe ser mayor a fechaInicioSolicitada.");
    }

    const durationMinutes = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const instancePlans = buildInstancePlans(input, durationMinutes);
    const resolvedFechasInstancias =
      input.fechasInstancias ?? input.instanciasDetalle?.map((item) => item.inicioProgramadoAt);
    const availableAccounts = await listAvailableCuentaZoomCandidatesForAllInstances(instancePlans);

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
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone: input.timezone ?? "America/Montevideo",
          capacidadEstimada: input.capacidadEstimada,
          controlAsistencia: input.controlAsistencia ?? false,
          docentesCorreos: input.docentesCorreos,
          grabacionPreferencia,
          requiereGrabacion,
          requiereAsistencia: input.requiereAsistencia ?? false,
          motivoAsistencia: input.motivoAsistencia,
          regimenEncuentros: input.regimenEncuentros,
          fechaFinRecurrencia: recurrenceEnd,
          patronRecurrencia: input.patronRecurrencia as Prisma.InputJsonValue | undefined,
          fechasInstancias: resolvedFechasInstancias,
          cantidadInstancias: instancePlans.length,
          estadoSolicitud: EstadoSolicitudSala.SIN_CAPACIDAD_ZOOM,
          observacionesAdmin:
            "No se encontro una cuenta Zoom activa con disponibilidad para todas las fechas solicitadas."
        }
      });

      await notifyAdminTelegramMovement({
        action: "SOLICITUD_CREADA_SIN_CAPACIDAD_ZOOM",
        actorEmail: user.email,
        actorRole: user.role,
        entityType: "SolicitudSala",
        entityId: created.id,
        summary: input.titulo,
        details: {
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: input.tipoInstancias,
          cantidadInstancias: instancePlans.length
        }
      });

      return created;
    }

    const requireManualResolution =
      input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM &&
      (input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO) !==
        MeetingIdEstrategia.MULTIPLE_PERMITIDO;

    const timezone = input.timezone ?? "America/Montevideo";
    let assignedAccount: CuentaZoom | null = requireManualResolution ? availableAccounts[0] : null;
    let zoomSnapshot: ZoomMeetingSnapshot | null = null;
    let lastProvisionError: string | null = null;

    if (!requireManualResolution) {
      if (
        input.tipoInstancias !== TipoInstancias.UNICA &&
        input.tipoInstancias !== TipoInstancias.MULTIPLE_COMPATIBLE_ZOOM
      ) {
        throw new Error("Solo se pueden crear automaticamente reuniones unicas o recurrentes compatibles con Zoom.");
      }

      for (const candidate of availableAccounts) {
        try {
          const candidateSnapshot = await createZoomMeetingForSolicitud({
            accountOwnerEmail: candidate.ownerEmail,
            input,
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

          assignedAccount = candidate;
          zoomSnapshot = candidateSnapshot;
          break;
        } catch (error) {
          lastProvisionError = error instanceof Error ? error.message : "Error al provisionar reunion en Zoom.";
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
            fechaInicioSolicitada: start,
            fechaFinSolicitada: end,
            timezone,
            capacidadEstimada: input.capacidadEstimada,
            controlAsistencia: input.controlAsistencia ?? false,
            docentesCorreos: input.docentesCorreos,
            grabacionPreferencia,
            requiereGrabacion,
            requiereAsistencia: input.requiereAsistencia ?? false,
            motivoAsistencia: input.motivoAsistencia,
            regimenEncuentros: input.regimenEncuentros,
            fechaFinRecurrencia: recurrenceEnd,
            patronRecurrencia: input.patronRecurrencia as Prisma.InputJsonValue | undefined,
            fechasInstancias: resolvedFechasInstancias,
            cantidadInstancias: instancePlans.length,
            estadoSolicitud: EstadoSolicitudSala.SIN_CAPACIDAD_ZOOM,
            observacionesAdmin:
              lastProvisionError ??
              "No se encontro una cuenta Zoom que permita provisionar todas las fechas solicitadas."
          }
        });

        await notifyAdminTelegramMovement({
          action: "SOLICITUD_CREADA_SIN_CAPACIDAD_ZOOM",
          actorEmail: user.email,
          actorRole: user.role,
          entityType: "SolicitudSala",
          entityId: created.id,
          summary: input.titulo,
          details: {
            modalidadReunion: input.modalidadReunion,
            tipoInstancias: input.tipoInstancias,
            cantidadInstancias: instancePlans.length
          }
        });

        return created;
      }
    }

    if (!assignedAccount) {
      throw new Error("No se pudo seleccionar una cuenta Zoom para la solicitud.");
    }

    const provisionedPlans = buildProvisionedEventPlans(zoomSnapshot, instancePlans, durationMinutes);
    const provisionedFechasInstancias = provisionedPlans.map((plan) => plan.inicio.toISOString());
    const meetingPrincipalId: string | null = zoomSnapshot?.meetingId ?? null;

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
          motivoMultiplesIds: requireManualResolution
            ? "El sistema no pudo asignar un único meeting ID para la solicitud." : null,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone,
          capacidadEstimada: input.capacidadEstimada,
          controlAsistencia: input.controlAsistencia ?? false,
          docentesCorreos: input.docentesCorreos,
          grabacionPreferencia,
          requiereGrabacion,
          requiereAsistencia: input.requiereAsistencia ?? false,
          motivoAsistencia: input.motivoAsistencia,
          regimenEncuentros: input.regimenEncuentros,
          fechaFinRecurrencia: recurrenceEnd,
          patronRecurrencia: input.patronRecurrencia as Prisma.InputJsonValue | undefined,
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
            zoomStartUrl: zoomSnapshot?.startUrl ?? null,
            zoomPayloadUltimo: zoomSnapshot?.rawPayload,
            sincronizadoConZoomAt: zoomSnapshot ? new Date() : null,
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
      if (!requireManualResolution && zoomSnapshot?.meetingId) {
        try {
          const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
          await rollbackClient.deleteMeeting(zoomSnapshot.meetingId, {
            schedule_for_reminder: false,
            cancel_meeting_reminder: false
          });
        } catch {
          try {
            const rollbackClient = await ZoomMeetingsClient.fromAccountCredentials();
            await rollbackClient.updateMeetingStatus(zoomSnapshot.meetingId, "end");
          } catch {
            // Keep original DB error.
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

    return result;
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
      events: events.map((event) => ({
        id: event.id,
        inicioProgramadoAt: event.inicioProgramadoAt,
        finProgramadoAt: event.finProgramadoAt,
        modalidadReunion: event.modalidadReunion,
        zoomMeetingId: event.zoomMeetingId,
        zoomJoinUrl: event.zoomJoinUrl,
        cuentaZoom: event.cuentaZoom,
        solicitud: event.solicitud,
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
      })),
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

    const event = await db.eventoZoom.findUnique({ where: { id: eventoId } });
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

    return interest;
  }

  async assignAssistant(
    admin: SessionUser,
    eventoId: string,
    input: { asistenteZoomId: string; motivoAsignacion?: string }
  ) {
    const event = await db.eventoZoom.findUnique({ where: { id: eventoId } });
    if (!event) throw new Error("Evento no encontrado.");

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

    return assignment;
  }

  async registerPastMeeting(admin: SessionUser, input: {
    docenteEmail: string;
    monitorEmail?: string;
    zoomMeetingId?: string;
    titulo: string;
    modalidadReunion: ModalidadReunion;
    inicioRealAt: string;
    finRealAt: string;
    timezone?: string;
    programaNombre?: string;
    responsableNombre?: string;
    descripcion?: string;
    zoomJoinUrl?: string;
  }) {
    const docenteEmail = input.docenteEmail.trim().toLowerCase();
    if (!docenteEmail) {
      throw new Error("docenteEmail es requerido.");
    }

    const monitorEmail = input.monitorEmail?.trim().toLowerCase() || null;
    const start = toDate(input.inicioRealAt, "inicioRealAt");
    const end = toDate(input.finRealAt, "finRealAt");
    if (end <= start) {
      throw new Error("finRealAt debe ser mayor que inicioRealAt.");
    }
    if (end > new Date()) {
      throw new Error("Solo se pueden registrar reuniones que ya finalizaron.");
    }

    const docenteUser = await db.user.findUnique({ where: { email: docenteEmail } });
    if (!docenteUser) {
      throw new Error("No existe un usuario docente con ese email.");
    }

    let monitorUser:
      | {
          id: string;
          email: string;
          role: UserRole;
        }
      | null = null;

    if (monitorEmail) {
      monitorUser = await db.user.findUnique({
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
        throw new Error("El usuario de monitoreo debe tener rol ASISTENTE_ZOOM o SOPORTE_ZOOM.");
      }
    }

    const account = await getOrCreateCuentaZoomDefault();
    if (!account) {
      throw new Error("No hay cuenta Zoom activa para registrar la reunion.");
    }

    const rate = await getActiveRate(input.modalidadReunion);
    if (monitorUser && !rate) {
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
          responsableNombre: input.responsableNombre,
          programaNombre: input.programaNombre,
          descripcion: input.descripcion ?? "Registro administrativo de reunion ya ejecutada.",
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: TipoInstancias.UNICA,
          meetingIdEstrategia: MeetingIdEstrategia.UNICO_PREFERIDO,
          meetingPrincipalId: meetingId,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone,
          requiereAsistencia: Boolean(monitorUser),
          motivoAsistencia: monitorUser ? "Registro manual para pago de monitoreo." : null,
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
          requiereAsistencia: Boolean(monitorUser),
          estadoCobertura: monitorUser
            ? EstadoCoberturaSoporte.CONFIRMADO
            : EstadoCoberturaSoporte.NO_REQUIERE,
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

      let assignment: { id: string } | null = null;

      if (monitorUser) {
        const assistant = await tx.asistenteZoom.upsert({
          where: { usuarioId: monitorUser.id },
          create: { usuarioId: monitorUser.id },
          update: {}
        });

        assignment = await tx.asignacionAsistente.create({
          data: {
            eventoZoomId: event.id,
            asistenteZoomId: assistant.id,
            tipoAsignacion: "PRINCIPAL",
            estadoAsignacion: "ACEPTADO",
            asignadoPorUsuarioId: admin.id,
            motivoAsignacion: "Registro manual de reunion ya ejecutada.",
            fechaRespuestaAt: new Date(),
            modalidadSnapshot: input.modalidadReunion,
            tarifaAplicadaHora: rate?.valorHora ?? new Prisma.Decimal(0),
            moneda: rate?.moneda ?? "UYU",
            montoEstimado: amount,
            montoConfirmado: amount
          },
          select: { id: true }
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "REGISTRO_MANUAL_REUNION_PASADA",
          entidadTipo: "EventoZoom",
          entidadId: event.id,
          valorNuevo: {
            solicitudId: solicitud.id,
            eventoId: event.id,
            asignacionId: assignment?.id ?? null,
            docenteEmail,
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
        asignacionId: assignment?.id ?? null
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
        monitorEmail: monitorEmail ?? "",
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



