"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LaunchIcon from "@mui/icons-material/Launch";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import CancelScheduleSendOutlinedIcon from "@mui/icons-material/CancelScheduleSendOutlined";
import RestoreFromTrashOutlinedIcon from "@mui/icons-material/RestoreFromTrashOutlined";
import MailOutlineOutlinedIcon from "@mui/icons-material/MailOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { ToggleButtons } from "@/components/toggle-buttons";
import {
  buildRecurringStarts,
  formatDateTime,
  getZoomWeekday,
  parseWeekdaysCsv,
  zoomMonthlyWeekOptions,
  type ZoomMonthlyMode,
  type ZoomRecurrenceType
} from "@/src/lib/spa-home/recurrence";
import type { SolicitudFormState } from "@/src/lib/spa-home/solicitud-form";
import type { Solicitud } from "@/src/services/solicitudesApi";
import { parseSpecificDatesInput } from "@/components/spa-tabs/solicitud-payload-builder";
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";

interface SpaTabSolicitudesProps {
  solicitudes: Solicitud[];
  form: SolicitudFormState;
  updateForm: <K extends keyof SolicitudFormState>(key: K, value: SolicitudFormState[K]) => void;
  onDeleteSolicitud: (solicitudId: string) => void;
  deletingSolicitudId: string | null;
  onCancelSolicitudSerie: (solicitudId: string, titulo: string) => void;
  cancellingSerieSolicitudId: string | null;
  onCancelSolicitudInstancia: (input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    occurrenceId?: string | null;
    startTime: string;
  }) => void;
  cancellingInstanciaKey: string | null;
  onRestoreSolicitudInstancia: (input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    startTime: string;
  }) => void;
  restoringInstanciaKey: string | null;
  canAddInstances: boolean;
  addingInstanceSolicitudId: string | null;
  onAddInstance: (input: {
    solicitudId: string;
    titulo: string;
    inicioProgramadoAt: string;
    finProgramadoAt: string;
  }) => Promise<boolean>;
  canSendReminder: boolean;
  sendingReminderSolicitudId: string | null;
  onSendReminder: (input: {
    solicitudId: string;
    toEmail?: string;
    mensaje?: string;
  }) => Promise<boolean>;
  canEditAssistance: boolean;
  updatingAssistanceSolicitudId: string | null;
  updatingAssistanceInstanceKey: string | null;
  onEnableAssistance: (input: {
    solicitudId: string;
    titulo: string;
    requiereAsistencia: boolean;
  }) => void;
  onToggleAssistanceForInstance: (input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    startTime: string;
    requiereAsistencia: boolean;
  }) => void;
  canDeleteSolicitud: boolean;
  canRestoreInstances: boolean;
  isSubmittingSolicitud: boolean;
  canCreateShortcut: boolean;
  canDelegateResponsable: boolean;
  responsableOptions: Array<{ value: string; label: string }>;
  docenteLinkedEmailOptions: string[];
  programaOptions: string[];
  isCreatingPrograma: boolean;
  onCreatePrograma: (nombre: string) => Promise<string | null>;
  docenteSolicitudesView: "form" | "list";
  setDocenteSolicitudesView: (view: "form" | "list") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const CREATE_PROGRAMA_VALUE = "__create_programa__";
type SolicitudesListScope = "ACTIVAS" | "FINALIZADAS";

const zoomWeekdayOptionsFull: Array<{ value: string; label: string }> = [
  { value: "1", label: "Domingo" },
  { value: "2", label: "Lunes" },
  { value: "3", label: "Martes" },
  { value: "4", label: "Miercoles" },
  { value: "5", label: "Jueves" },
  { value: "6", label: "Viernes" },
  { value: "7", label: "Sabado" }
];

const ZOOM_ACCOUNT_COLOR_PALETTE = [
  "#0D9488",
  "#0284C7",
  "#2563EB",
  "#1D4ED8",
  "#0F766E",
  "#15803D",
  "#65A30D",
  "#CA8A04",
  "#EA580C",
  "#DC2626",
  "#BE185D",
  "#C2410C",
  "#6D28D9",
  "#5B21B6",
  "#334155",
  "#4D7C0F",
  "#0369A1",
  "#7C2D12",
  "#9F1239",
  "#166534"
];

const ADD_INSTANCE_BUSY_MESSAGES = [
  "Guardando instancia en el sistema...",
  "Sincronizando instancia con Zoom...",
  "Actualizando datos de la solicitud..."
];

function hashLabel(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getZoomAccountColor(accountLabel: string): string {
  const normalized = accountLabel.trim().toLowerCase();
  if (!normalized || normalized === "-") {
    return "#64748B";
  }
  const paletteIndex = hashLabel(normalized) % ZOOM_ACCOUNT_COLOR_PALETTE.length;
  return ZOOM_ACCOUNT_COLOR_PALETTE[paletteIndex];
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDurationToMinutes(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function minutesToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type SpecificDateDetail = {
  horaInicio: string;
  horaFin: string;
  duracionMinutos?: string;
};

type SpecificDateDetailMap = Record<string, SpecificDateDetail>;

function parseSpecificDateDetails(rawInput: string): SpecificDateDetailMap {
  if (!rawInput.trim()) return {};
  try {
    const parsed = JSON.parse(rawInput) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: SpecificDateDetailMap = {};
    for (const [dateIso, value] of Object.entries(parsed)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) continue;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const horaInicio =
        typeof (value as { horaInicio?: unknown }).horaInicio === "string"
          ? (value as { horaInicio: string }).horaInicio.trim()
          : "";
      const horaFin =
        typeof (value as { horaFin?: unknown }).horaFin === "string"
          ? (value as { horaFin: string }).horaFin.trim()
          : "";
      const duracionMinutos =
        typeof (value as { duracionMinutos?: unknown }).duracionMinutos === "string"
          ? (value as { duracionMinutos: string }).duracionMinutos.trim()
          : "";
      if (!horaInicio) continue;
      result[dateIso] = {
        horaInicio,
        horaFin,
        duracionMinutos: duracionMinutos || undefined
      };
    }
    return result;
  } catch {
    return {};
  }
}

function serializeSpecificDateDetails(details: SpecificDateDetailMap): string {
  const orderedEntries = Object.entries(details)
    .filter(([dateIso]) => /^\d{4}-\d{2}-\d{2}$/.test(dateIso))
    .sort((left, right) => left[0].localeCompare(right[0], "es"));

  const normalized: Record<string, SpecificDateDetail> = {};
  for (const [dateIso, value] of orderedEntries) {
    normalized[dateIso] = value;
  }
  return JSON.stringify(normalized);
}

function normalizeEmailInputAsLines(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[;,]+/g, "\n")
    .replace(/\n[ \t]+/g, "\n");
}

function toDateTimeLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function extractLocalDatePart(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const rawDate = normalized.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) return rawDate;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function toUtcCalendarStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function slugifyForFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "actividad";
}

function parseZoomMeetingIdFromJoinUrl(joinUrl?: string | null): string | null {
  if (!joinUrl) return null;
  try {
    const parsed = new URL(joinUrl);
    const pieces = parsed.pathname.split("/").filter(Boolean);
    const roomTypeIndex = pieces.findIndex((piece) => piece === "j" || piece === "w");
    if (roomTypeIndex < 0) return null;
    const rawId = pieces[roomTypeIndex + 1] ?? "";
    const meetingId = rawId.replace(/\D/g, "");
    return meetingId || null;
  } catch {
    return null;
  }
}

function resolveInstanceEndIso(
  instance: NonNullable<Solicitud["zoomInstances"]>[number]
): string {
  const explicitEnd = (instance.endTime ?? "").trim();
  if (explicitEnd) return explicitEnd;

  const startDate = new Date(instance.startTime);
  if (Number.isNaN(startDate.getTime())) return instance.startTime;
  const durationMinutes = Number.isFinite(instance.durationMinutes) && instance.durationMinutes > 0
    ? instance.durationMinutes
    : 60;
  return new Date(startDate.getTime() + durationMinutes * 60_000).toISOString();
}

function buildSolicitudInstanceIcsContent(input: {
  solicitud: Pick<Solicitud, "id" | "titulo" | "programaNombre" | "meetingPrincipalId">;
  instance: NonNullable<Solicitud["zoomInstances"]>[number];
}): string {
  const startIso = input.instance.startTime;
  const endIso = resolveInstanceEndIso(input.instance);
  const dtStamp = toUtcCalendarStamp(new Date().toISOString());
  const dtStart = toUtcCalendarStamp(startIso);
  const dtEnd = toUtcCalendarStamp(endIso);
  const joinUrl = input.instance.joinUrl ?? null;
  const meetingId = parseZoomMeetingIdFromJoinUrl(joinUrl) ?? input.solicitud.meetingPrincipalId ?? "-";
  const summary = escapeIcsText(input.solicitud.titulo || "Actividad Zoom");
  const detailsLines = [
    `Solicitud: ${input.solicitud.id}`,
    `Programa: ${input.solicitud.programaNombre || "Sin programa"}`,
    `Meeting ID: ${meetingId}`,
    joinUrl ? `Zoom: ${joinUrl}` : null
  ].filter(Boolean) as string[];
  const description = escapeIcsText(detailsLines.join("\n"));

  const uidSeed = input.instance.eventId ?? input.instance.occurrenceId ?? startIso;
  const uid = `${input.solicitud.id}-${uidSeed}@flacso-uruguay`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FLACSO Uruguay//Plataforma Zoom//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "LOCATION:Zoom",
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  if (joinUrl) {
    lines.splice(lines.length - 2, 0, `URL:${escapeIcsText(joinUrl)}`);
  }

  return lines.join("\r\n");
}

function downloadSolicitudInstanceIcs(input: {
  solicitud: Pick<Solicitud, "id" | "titulo" | "programaNombre" | "meetingPrincipalId">;
  instance: NonNullable<Solicitud["zoomInstances"]>[number];
}): void {
  const content = buildSolicitudInstanceIcsContent(input);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const dateLabel = input.instance.startTime.slice(0, 10).replace(/[^0-9]/g, "");
  const uidSeed = input.instance.eventId ?? input.instance.occurrenceId ?? "instancia";
  const fileName = `${slugifyForFileName(input.solicitud.titulo || "actividad")}-${dateLabel}-${uidSeed}.ics`;

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export function SpaTabSolicitudes({
  solicitudes,
  form,
  updateForm,
  onDeleteSolicitud,
  deletingSolicitudId,
  onCancelSolicitudSerie,
  cancellingSerieSolicitudId,
  onCancelSolicitudInstancia,
  cancellingInstanciaKey,
  onRestoreSolicitudInstancia,
  restoringInstanciaKey,
  canAddInstances,
  addingInstanceSolicitudId,
  onAddInstance,
  canSendReminder,
  sendingReminderSolicitudId,
  onSendReminder,
  canEditAssistance,
  updatingAssistanceSolicitudId,
  updatingAssistanceInstanceKey,
  onEnableAssistance,
  onToggleAssistanceForInstance,
  canDeleteSolicitud,
  canRestoreInstances,
  isSubmittingSolicitud,
  canCreateShortcut,
  canDelegateResponsable,
  responsableOptions,
  docenteLinkedEmailOptions,
  programaOptions,
  isCreatingPrograma,
  onCreatePrograma,
  docenteSolicitudesView,
  setDocenteSolicitudesView,
  onSubmit
}: SpaTabSolicitudesProps) {
  const [expandedSolicitudId, setExpandedSolicitudId] = useState<string | null>(null);
  const [showCancelledBySolicitudId, setShowCancelledBySolicitudId] = useState<Record<string, boolean>>({});
  const [createProgramaOpen, setCreateProgramaOpen] = useState(false);
  const [newProgramaNombre, setNewProgramaNombre] = useState("");
  const [solicitudesListScope, setSolicitudesListScope] = useState<SolicitudesListScope>("ACTIVAS");
  const [specificDateInput, setSpecificDateInput] = useState("");
  const [reminderDialogSolicitud, setReminderDialogSolicitud] = useState<{
    id: string;
    titulo: string;
  } | null>(null);
  const [reminderToEmail, setReminderToEmail] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [addInstanceDialogSolicitud, setAddInstanceDialogSolicitud] = useState<{
    id: string;
    titulo: string;
  } | null>(null);
  const [addInstanceStartLocal, setAddInstanceStartLocal] = useState("");
  const [addInstanceEndLocal, setAddInstanceEndLocal] = useState("");
  const specificDateDetails = useMemo(
    () => parseSpecificDateDetails(form.fechasEspecificasDetalle),
    [form.fechasEspecificasDetalle]
  );
  const linkedEmailOptions = useMemo(
    () =>
      Array.from(
        new Set(
          docenteLinkedEmailOptions
            .map((item) => item.trim().toLowerCase())
            .filter((item) => isLikelyEmail(item))
        )
      ),
    [docenteLinkedEmailOptions]
  );

  function getDefaultSpecificStartTime(): string {
    if (parseTimeToMinutes(form.horaInicioRecurrente) !== null) {
      return form.horaInicioRecurrente;
    }
    return "09:00";
  }

  function getDefaultSpecificEndTime(startTime: string): string {
    const startMinutes = parseTimeToMinutes(startTime);
    if (startMinutes === null) return "11:00";
    const recurringEndMinutes = parseTimeToMinutes(form.horaFinRecurrente);
    if (recurringEndMinutes !== null && recurringEndMinutes > startMinutes) {
      return form.horaFinRecurrente;
    }
    const recurringDuration = parseDurationToMinutes(form.duracionRecurrente);
    if (recurringDuration !== null) {
      const resolved = minutesToTime(startMinutes + recurringDuration);
      if (resolved) return resolved;
    }
    const fallback = minutesToTime(startMinutes + 120);
    return fallback || "11:00";
  }

  function buildSpecificDateDetailFallback(): SpecificDateDetail {
    const horaInicio = getDefaultSpecificStartTime();
    return {
      horaInicio,
      horaFin: getDefaultSpecificEndTime(horaInicio),
      duracionMinutos: form.duracionRecurrente.trim() || undefined
    };
  }

  function extractEmailCandidate(raw?: string | null): string {
    const normalized = (raw ?? "").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
  }

  function openReminderDialog(item: Solicitud) {
    setReminderDialogSolicitud({ id: item.id, titulo: item.titulo });
    setReminderToEmail(extractEmailCandidate(item.responsableNombre));
    setReminderMessage("");
  }

  function closeReminderDialog() {
    if (sendingReminderSolicitudId) return;
    setReminderDialogSolicitud(null);
    setReminderToEmail("");
    setReminderMessage("");
  }

  async function submitReminderDialog() {
    if (!reminderDialogSolicitud) return;
    const success = await onSendReminder({
      solicitudId: reminderDialogSolicitud.id,
      toEmail: reminderToEmail.trim() || undefined,
      mensaje: reminderMessage.trim() || undefined
    });
    if (success) {
      setReminderDialogSolicitud(null);
      setReminderToEmail("");
      setReminderMessage("");
    }
  }

  function openAddInstanceDialog(
    solicitud: Pick<Solicitud, "id" | "titulo">,
    instances: NonNullable<Solicitud["zoomInstances"]>
  ) {
    const sorted = [...instances].sort(
      (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    );
    const last = sorted[sorted.length - 1];
    const previous = sorted.length > 1 ? sorted[sorted.length - 2] : undefined;

    const now = new Date();
    const defaultStartFromNow = new Date(now.getTime() + 24 * 60 * 60_000);
    let defaultStart = defaultStartFromNow;
    let durationMinutes = 90;

    if (last) {
      const lastStart = new Date(last.startTime);
      const inferredDuration = Math.max(30, last.durationMinutes || 0);
      const intervalMs = previous
        ? Math.max(60 * 60_000, lastStart.getTime() - new Date(previous.startTime).getTime())
        : 7 * 24 * 60 * 60_000;
      durationMinutes = inferredDuration;
      defaultStart = new Date(lastStart.getTime() + intervalMs);
    }

    const defaultEnd = new Date(defaultStart.getTime() + durationMinutes * 60_000);
    setAddInstanceDialogSolicitud({ id: solicitud.id, titulo: solicitud.titulo });
    setAddInstanceStartLocal(toDateTimeLocalInput(defaultStart.toISOString()));
    setAddInstanceEndLocal(toDateTimeLocalInput(defaultEnd.toISOString()));
  }

  function closeAddInstanceDialog() {
    if (addingInstanceSolicitudId) return;
    setAddInstanceDialogSolicitud(null);
    setAddInstanceStartLocal("");
    setAddInstanceEndLocal("");
  }

  async function submitAddInstanceDialog() {
    if (!addInstanceDialogSolicitud) return;
    const sameDay =
      extractLocalDatePart(addInstanceStartLocal) !== null &&
      extractLocalDatePart(addInstanceStartLocal) === extractLocalDatePart(addInstanceEndLocal);
    if (!sameDay) return;

    const start = new Date(addInstanceStartLocal);
    const end = new Date(addInstanceEndLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    const success = await onAddInstance({
      solicitudId: addInstanceDialogSolicitud.id,
      titulo: addInstanceDialogSolicitud.titulo,
      inicioProgramadoAt: start.toISOString(),
      finProgramadoAt: end.toISOString()
    });

    if (success) {
      setAddInstanceDialogSolicitud(null);
      setAddInstanceStartLocal("");
      setAddInstanceEndLocal("");
    }
  }

  function syncDurationFromTimes(startTime: string, endTime: string): string {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return "";
    }
    return String(endMinutes - startMinutes);
  }

  function syncEndFromDuration(startTime: string, durationText: string): string {
    const startMinutes = parseTimeToMinutes(startTime);
    const durationMinutes = parseDurationToMinutes(durationText);
    if (startMinutes === null || durationMinutes === null) {
      return "";
    }
    return minutesToTime(startMinutes + durationMinutes);
  }

  function handleUniqueStartChange(nextStart: string) {
    updateForm("horaInicioUnica", nextStart);
    if (form.duracionUnica.trim()) {
      updateForm("horaFinUnica", syncEndFromDuration(nextStart, form.duracionUnica));
      return;
    }
    if (form.horaFinUnica.trim()) {
      updateForm("duracionUnica", syncDurationFromTimes(nextStart, form.horaFinUnica));
    }
  }

  function handleUniqueEndChange(nextEnd: string) {
    updateForm("horaFinUnica", nextEnd);
    updateForm("duracionUnica", syncDurationFromTimes(form.horaInicioUnica, nextEnd));
  }

  function handleUniqueDurationChange(nextDuration: string) {
    updateForm("duracionUnica", nextDuration);
    updateForm("horaFinUnica", syncEndFromDuration(form.horaInicioUnica, nextDuration));
  }

  function handleRecurringStartChange(nextStart: string) {
    updateForm("horaInicioRecurrente", nextStart);
    if (form.duracionRecurrente.trim()) {
      updateForm("horaFinRecurrente", syncEndFromDuration(nextStart, form.duracionRecurrente));
      return;
    }
    if (form.horaFinRecurrente.trim()) {
      updateForm("duracionRecurrente", syncDurationFromTimes(nextStart, form.horaFinRecurrente));
    }
  }

  function handleRecurringEndChange(nextEnd: string) {
    updateForm("horaFinRecurrente", nextEnd);
    updateForm("duracionRecurrente", syncDurationFromTimes(form.horaInicioRecurrente, nextEnd));
  }

  function handleRecurringDurationChange(nextDuration: string) {
    updateForm("duracionRecurrente", nextDuration);
    updateForm("horaFinRecurrente", syncEndFromDuration(form.horaInicioRecurrente, nextDuration));
  }

  function getSpecificDatesFallbackYear(): number {
    if (form.primerDiaRecurrente && /^\d{4}-\d{2}-\d{2}$/.test(form.primerDiaRecurrente)) {
      const parsedYear = Number(form.primerDiaRecurrente.slice(0, 4));
      if (Number.isInteger(parsedYear)) return parsedYear;
    }
    return new Date().getFullYear();
  }

  function parseSpecificDatesFromForm(): string[] {
    return parseSpecificDatesInput(form.fechasEspecificas, getSpecificDatesFallbackYear()).dates;
  }

  function persistSpecificDates(dates: string[]) {
    const sortedUnique = [...new Set(dates)].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    updateForm("fechasEspecificas", sortedUnique.join("\n"));
    const nextDetails: SpecificDateDetailMap = {};
    for (const dateIso of sortedUnique) {
      nextDetails[dateIso] = specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback();
    }
    updateForm("fechasEspecificasDetalle", serializeSpecificDateDetails(nextDetails));
  }

  function handleAddSpecificDate() {
    if (!specificDateInput) return;
    const parsedInput = parseSpecificDatesInput(specificDateInput, getSpecificDatesFallbackYear());
    const dateToAdd = parsedInput.dates[0];
    if (!dateToAdd) return;
    persistSpecificDates([...parseSpecificDatesFromForm(), dateToAdd]);
    setSpecificDateInput("");
  }

  function handleRemoveSpecificDate(dateIso: string) {
    persistSpecificDates(parseSpecificDatesFromForm().filter((item) => item !== dateIso));
  }

  function setSpecificDateTimes(dateIso: string, nextValues: Partial<SpecificDateDetail>) {
    const current = specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback();
    const next: SpecificDateDetail = {
      ...current,
      ...nextValues
    };
    const nextDetails: SpecificDateDetailMap = {
      ...specificDateDetails,
      [dateIso]: next
    };
    updateForm("fechasEspecificasDetalle", serializeSpecificDateDetails(nextDetails));
  }

  function handleSpecificDateStartChange(dateIso: string, nextStart: string) {
    const current = specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback();
    const previousDuration = syncDurationFromTimes(current.horaInicio, current.horaFin);
    const resolvedEnd =
      previousDuration && syncEndFromDuration(nextStart, previousDuration)
        ? syncEndFromDuration(nextStart, previousDuration)
        : getDefaultSpecificEndTime(nextStart);
    setSpecificDateTimes(dateIso, {
      horaInicio: nextStart,
      horaFin: resolvedEnd
    });
  }

  function handleSpecificDateEndChange(dateIso: string, nextEnd: string) {
    const current = specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback();
    setSpecificDateTimes(dateIso, {
      horaFin: nextEnd,
      duracionMinutos: syncDurationFromTimes(current.horaInicio, nextEnd) || undefined
    });
  }

  const recurrencePreview = useMemo(() => {
    if (form.unaOVarias !== "VARIAS" || form.variasModo !== "RECURRENCIA_ZOOM") {
      return { dates: [] as Date[], error: "" };
    }

    if (!form.primerDiaRecurrente || !form.horaInicioRecurrente || !form.fechaFinal) {
      return { dates: [] as Date[], error: "" };
    }

    const firstAnchorDate = new Date(`${form.primerDiaRecurrente}T${form.horaInicioRecurrente}`);
    if (Number.isNaN(firstAnchorDate.getTime())) {
      return { dates: [] as Date[], error: "Primer dia u hora de comienzo invalido." };
    }

    const recurrenceEnd = new Date(`${form.fechaFinal}T${form.horaInicioRecurrente}`);
    if (Number.isNaN(recurrenceEnd.getTime())) {
      return { dates: [] as Date[], error: "Fecha final invalida." };
    }

    if (recurrenceEnd <= firstAnchorDate) {
      return { dates: [] as Date[], error: "La fecha final debe ser posterior a la primera fecha." };
    }

    const recurrenceType = form.recurrenciaTipoZoom as ZoomRecurrenceType;
    if (!["1", "2", "3"].includes(recurrenceType)) {
      return { dates: [] as Date[], error: "Tipo de recurrencia invalido." };
    }

    const repeatInterval = Number(form.recurrenciaIntervalo);
    if (!Number.isInteger(repeatInterval) || repeatInterval < 1) {
      return { dates: [] as Date[], error: "Intervalo de recurrencia invalido." };
    }

    const weeklyDays = parseWeekdaysCsv(form.recurrenciaDiasSemana);
    if (recurrenceType === "2" && weeklyDays.length === 0) {
      return { dates: [] as Date[], error: "Selecciona al menos un dia de la semana." };
    }

    const weeklyDaysForRule =
      recurrenceType === "2"
        ? [...new Set([...weeklyDays, getZoomWeekday(firstAnchorDate)])].sort((a, b) => a - b)
        : [];

    const monthlyMode = form.recurrenciaMensualModo as ZoomMonthlyMode;
    if (!["DAY_OF_MONTH", "WEEKDAY_OF_MONTH"].includes(monthlyMode)) {
      return { dates: [] as Date[], error: "Modo mensual invalido." };
    }

    const monthlyDay = Number(form.recurrenciaDiaMes);
    if (
      recurrenceType === "3" &&
      monthlyMode === "DAY_OF_MONTH" &&
      (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31)
    ) {
      return { dates: [] as Date[], error: "Dia del mes invalido (1 a 31)." };
    }

    const monthlyWeek = Number(form.recurrenciaSemanaMes) as -1 | 1 | 2 | 3 | 4;
    if (recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH" && ![-1, 1, 2, 3, 4].includes(monthlyWeek)) {
      return { dates: [] as Date[], error: "Semana del mes invalida." };
    }

    const monthlyWeekDay = Number(form.recurrenciaDiaSemanaMes);
    if (
      recurrenceType === "3" &&
      monthlyMode === "WEEKDAY_OF_MONTH" &&
      (!Number.isInteger(monthlyWeekDay) || monthlyWeekDay < 1 || monthlyWeekDay > 7)
    ) {
      return { dates: [] as Date[], error: "Dia de semana mensual invalido." };
    }

    const dates = buildRecurringStarts({
      firstStart: firstAnchorDate,
      recurrenceEnd,
      recurrenceType,
      repeatInterval,
      weeklyDays: weeklyDaysForRule,
      monthlyMode,
      monthlyDay,
      monthlyWeek,
      monthlyWeekDay
    });

    if (dates.length === 0) {
      return { dates: [] as Date[], error: "Con esta configuracion no se generan fechas." };
    }

    if (dates.length > 50) {
      return {
        dates: dates.slice(0, 50),
        error: "Zoom permite como maximo 50 ocurrencias. Ajusta fecha final o intervalo."
      };
    }

    return { dates, error: "" };
  }, [
    form.unaOVarias,
    form.variasModo,
    form.primerDiaRecurrente,
    form.horaInicioRecurrente,
    form.fechaFinal,
    form.recurrenciaTipoZoom,
    form.recurrenciaIntervalo,
    form.recurrenciaDiasSemana,
    form.recurrenciaMensualModo,
    form.recurrenciaDiaMes,
    form.recurrenciaSemanaMes,
    form.recurrenciaDiaSemanaMes
  ]);

  const specificDatesPreview = useMemo(() => {
    if (form.unaOVarias !== "VARIAS" || form.variasModo !== "FECHAS_ESPECIFICAS") {
      return { dates: [] as string[], error: "" };
    }

    const parsed = parseSpecificDatesInput(form.fechasEspecificas, getSpecificDatesFallbackYear());
    if (parsed.errors.length > 0) {
      return { dates: [] as string[], error: parsed.errors[0] ?? "Hay fechas invalidas." };
    }
    if (parsed.dates.length === 0) {
      return { dates: [] as string[], error: "" };
    }
    if (parsed.dates.length > 50) {
      return {
        dates: parsed.dates.slice(0, 50),
        error: "Zoom permite como maximo 50 ocurrencias. Reduce la cantidad de fechas."
      };
    }
    return { dates: parsed.dates, error: "" };
  }, [
    form.unaOVarias,
    form.variasModo,
    form.primerDiaRecurrente,
    form.fechasEspecificas
  ]);

  const specificDatesScheduleError = useMemo(() => {
    if (form.unaOVarias !== "VARIAS" || form.variasModo !== "FECHAS_ESPECIFICAS") return "";
    if (specificDatesPreview.dates.length === 0) return "";
    for (const dateIso of specificDatesPreview.dates) {
      const detail = specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback();
      const startMinutes = parseTimeToMinutes(detail.horaInicio);
      if (startMinutes === null) {
        return `Horario invalido en ${dateIso}: falta una hora de comienzo valida.`;
      }
      const endMinutes = parseTimeToMinutes(detail.horaFin);
      if (endMinutes === null) {
        return `Horario invalido en ${dateIso}: falta una hora de fin valida.`;
      }
      if (endMinutes <= startMinutes) {
        return `Horario invalido en ${dateIso}: la hora de fin debe ser posterior al inicio.`;
      }
    }
    return "";
  }, [form.unaOVarias, form.variasModo, specificDatesPreview.dates, specificDateDetails, form.horaInicioRecurrente, form.horaFinRecurrente, form.duracionRecurrente]);

  const isSpecificDatesModeInvalid =
    form.unaOVarias === "VARIAS" &&
    form.variasModo === "FECHAS_ESPECIFICAS" &&
    (Boolean(specificDatesPreview.error) || Boolean(specificDatesScheduleError) || specificDatesPreview.dates.length < 2);

  function resolveSolicitudStatusCode(item: Solicitud): string {
    return item.estadoSolicitudVista ?? item.estadoSolicitud;
  }

  function mapSolicitudStatus(estado: string): { label: string; color: "default" | "warning" | "success" | "error" | "info" } {
    if (estado === "PROVISIONADA") return { label: "LISTO", color: "success" };
    if (estado === "PENDIENTE_ASISTENCIA_ZOOM") return { label: "PENDIENTE_ASISTENCIA_ZOOM", color: "warning" };
    if (estado === "PROVISIONANDO") return { label: "Provisionando", color: "info" };
    if (estado === "PENDIENTE_RESOLUCION_MANUAL_ID") return { label: "Pendiente manual", color: "warning" };
    if (estado === "SIN_CAPACIDAD_ZOOM") return { label: "Sin capacidad Zoom", color: "error" };
    if (estado === "CANCELADA_ADMIN") return { label: "Cancelada admin", color: "error" };
    if (estado === "CANCELADA_DOCENTE") return { label: "Cancelada docente", color: "error" };
    if (estado === "REGISTRADA") return { label: "Registrada", color: "default" };
    return { label: estado, color: "default" };
  }

  function isSolicitudCancelledStatus(estadoSolicitud: string): boolean {
    return estadoSolicitud === "CANCELADA_ADMIN" || estadoSolicitud === "CANCELADA_DOCENTE";
  }

  function isInstanceCancelledOrFinalizada(instance: NonNullable<Solicitud["zoomInstances"]>[number]): boolean {
    return instance.estadoEvento === "CANCELADO" || instance.estadoEvento === "FINALIZADO" || instance.status === "deleted";
  }

  function resolveInstanceEndMs(instance: NonNullable<Solicitud["zoomInstances"]>[number]): number | null {
    const parsedEnd = instance.endTime ? new Date(instance.endTime).getTime() : Number.NaN;
    if (Number.isFinite(parsedEnd)) return parsedEnd;

    const parsedStart = new Date(instance.startTime).getTime();
    if (!Number.isFinite(parsedStart)) return null;

    const durationMinutes = Number(instance.durationMinutes);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return parsedStart + durationMinutes * 60_000;
    }

    return parsedStart;
  }

  function isInstanceActiveOrUpcoming(
    instance: NonNullable<Solicitud["zoomInstances"]>[number],
    nowMs: number
  ): boolean {
    if (isInstanceCancelledOrFinalizada(instance)) {
      return false;
    }

    const endMs = resolveInstanceEndMs(instance);
    if (endMs === null) {
      return true;
    }

    return endMs >= nowMs;
  }

  const solicitudesByLifecycle = useMemo(() => {
    const nowMs = Date.now();
    const activas: Solicitud[] = [];
    const finalizadas: Solicitud[] = [];

    for (const solicitud of solicitudes) {
      const instances = solicitud.zoomInstances ?? [];
      if (instances.length === 0) {
        if (isSolicitudCancelledStatus(solicitud.estadoSolicitud)) {
          finalizadas.push(solicitud);
        } else {
          activas.push(solicitud);
        }
        continue;
      }

      const hasActiveOrUpcoming = instances.some((instance) => isInstanceActiveOrUpcoming(instance, nowMs));
      if (hasActiveOrUpcoming) {
        activas.push(solicitud);
      } else {
        finalizadas.push(solicitud);
      }
    }

    return { activas, finalizadas };
  }, [solicitudes]);

  function resolveSolicitudSortStartMs(
    solicitud: Solicitud,
    scope: SolicitudesListScope,
    nowMs: number
  ): number {
    const instances = solicitud.zoomInstances ?? [];
    let earliestAnyStartMs = Number.POSITIVE_INFINITY;
    let earliestNonCancelledStartMs = Number.POSITIVE_INFINITY;
    let earliestActiveOrUpcomingStartMs = Number.POSITIVE_INFINITY;

    for (const instance of instances) {
      const parsedStart = new Date(instance.startTime).getTime();
      if (!Number.isFinite(parsedStart)) continue;

      earliestAnyStartMs = Math.min(earliestAnyStartMs, parsedStart);

      if (!isInstanceCancelledOrFinalizada(instance)) {
        earliestNonCancelledStartMs = Math.min(earliestNonCancelledStartMs, parsedStart);
      }

      if (isInstanceActiveOrUpcoming(instance, nowMs)) {
        earliestActiveOrUpcomingStartMs = Math.min(earliestActiveOrUpcomingStartMs, parsedStart);
      }
    }

    if (scope === "ACTIVAS" && Number.isFinite(earliestActiveOrUpcomingStartMs)) {
      return earliestActiveOrUpcomingStartMs;
    }
    if (Number.isFinite(earliestNonCancelledStartMs)) return earliestNonCancelledStartMs;
    if (Number.isFinite(earliestAnyStartMs)) return earliestAnyStartMs;

    const parsedCreatedAt = new Date(solicitud.createdAt).getTime();
    if (Number.isFinite(parsedCreatedAt)) return parsedCreatedAt;

    return Number.POSITIVE_INFINITY;
  }

  const visibleSolicitudes = useMemo(() => {
    const nowMs = Date.now();
    const source =
      solicitudesListScope === "ACTIVAS"
        ? solicitudesByLifecycle.activas
        : solicitudesByLifecycle.finalizadas;

    return [...source].sort((left, right) => {
      const leftStartMs = resolveSolicitudSortStartMs(left, solicitudesListScope, nowMs);
      const rightStartMs = resolveSolicitudSortStartMs(right, solicitudesListScope, nowMs);
      if (leftStartMs !== rightStartMs) return leftStartMs - rightStartMs;

      const byTitle = left.titulo.localeCompare(right.titulo, "es", {
        sensitivity: "base",
        numeric: true
      });
      if (byTitle !== 0) return byTitle;

      return left.id.localeCompare(right.id, "es", { sensitivity: "base" });
    });
  }, [solicitudesByLifecycle, solicitudesListScope]);

  const statusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of visibleSolicitudes) {
      const statusCode = resolveSolicitudStatusCode(item);
      counts.set(statusCode, (counts.get(statusCode) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([estado, count]) => ({
        estado,
        count,
        ...mapSolicitudStatus(estado)
      }))
      .sort((left, right) => right.count - left.count);
  }, [visibleSolicitudes]);

  function mapInstanciaStatus(
    estadoEvento: string | null | undefined,
    zoomStatus: string | null | undefined
  ): { label: string; color: "default" | "warning" | "success" | "error" | "info"; cancellable: boolean } {
    if (estadoEvento === "CANCELADO" || zoomStatus === "deleted") {
      return { label: "Cancelada", color: "error", cancellable: false };
    }
    if (estadoEvento === "FINALIZADO") {
      return { label: "Finalizada", color: "default", cancellable: false };
    }
    if (estadoEvento === "PROGRAMADO" || estadoEvento === "CREADO_ZOOM") {
      return { label: "Programada", color: "success", cancellable: true };
    }
    if (zoomStatus === "available") {
      return { label: "Disponible", color: "success", cancellable: true };
    }
    return { label: "Activa", color: "info", cancellable: true };
  }

  function renderInstanceList(
    item: Solicitud,
    instances: NonNullable<Solicitud["zoomInstances"]>,
    isSolicitudCancelled: boolean
  ) {
    if (instances.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          Esta solicitud no tiene instancias disponibles.
        </Typography>
      );
    }

    const preparedInstances = instances.map((instance, index) => {
      const status = mapInstanciaStatus(instance.estadoEvento, instance.status);
      return {
        instance,
        index,
        status
      };
    });

    const activeOrFinalizedInstances = preparedInstances.filter((entry) => entry.status.label !== "Cancelada");
    const cancelledInstances = preparedInstances.filter((entry) => entry.status.label === "Cancelada");

    function renderInstanceRows(
      rows: typeof preparedInstances,
      options?: { muted?: boolean; withNumbering?: boolean }
    ) {
      const isMuted = Boolean(options?.muted);
      const withNumbering = options?.withNumbering ?? true;
      return (
        <Stack spacing={1.2}>
          {rows.map(({ instance, status }, rowIndex) => {
            const isInstanceCancelled = isSolicitudCancelled || !status.cancellable;
            const instanceKey = `${item.id}:${instance.eventId ?? instance.occurrenceId ?? instance.startTime}`;
            const isRestoreInProgress = restoringInstanciaKey === instanceKey;
            const canRestoreThisInstance = canRestoreInstances && status.label === "Cancelada";
            const canCancelThisInstance = canDeleteSolicitud && status.cancellable;
            const canScheduleThisInstance = status.label !== "Cancelada";
            const requiresAssistance =
              Boolean(instance.requiereAsistencia) &&
              instance.estadoCobertura !== "NO_REQUIERE";
            const canManageAssistanceThisInstance = canEditAssistance && status.cancellable;

            return (
              <Paper
                key={instanceKey}
                variant="outlined"
                sx={{
                  p: 1.2,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  backgroundColor: isMuted ? "rgba(185, 28, 28, 0.04)" : "background.paper"
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {withNumbering ? `${rowIndex + 1}. ` : ""}
                    {formatDateTime(instance.startTime)}
                  </Typography>
                  <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                    <Chip size="small" color={status.color} label={status.label} />
                    <MeetingAssistantStatusChip
                      requiresAssistance={requiresAssistance}
                      assistantName={instance.monitorNombre ?? null}
                      assistantEmail={instance.monitorEmail ?? null}
                      pendingLabel="Pendiente"
                    />
                    {instance.occurrenceId ? (
                      <Chip size="small" variant="outlined" label={`occurrence_id ${instance.occurrenceId}`} />
                    ) : null}
                  </Stack>
                </Box>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  {canScheduleThisInstance && (
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      color="info"
                      startIcon={<EventAvailableOutlinedIcon fontSize="small" />}
                      onClick={() =>
                        downloadSolicitudInstanceIcs({
                          solicitud: item,
                          instance
                        })
                      }
                    >
                      Agendar
                    </Button>
                  )}
                  {canManageAssistanceThisInstance && (
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      color={requiresAssistance ? "warning" : "primary"}
                      startIcon={
                        requiresAssistance ? (
                          <CancelScheduleSendOutlinedIcon fontSize="small" />
                        ) : (
                          <EditOutlinedIcon fontSize="small" />
                        )
                      }
                      disabled={Boolean(updatingAssistanceInstanceKey) || isRestoreInProgress || cancellingInstanciaKey === instanceKey}
                      onClick={() =>
                        onToggleAssistanceForInstance({
                          solicitudId: item.id,
                          titulo: item.titulo,
                          eventoId: instance.eventId ?? undefined,
                          startTime: instance.startTime,
                          requiereAsistencia: !requiresAssistance
                        })
                      }
                    >
                      {updatingAssistanceInstanceKey === instanceKey
                        ? "Guardando..."
                        : requiresAssistance
                          ? "Cancelar asistencia"
                          : "Pedir asistencia"}
                    </Button>
                  )}
                  {canCancelThisInstance && (
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      color="warning"
                      startIcon={<EventBusyOutlinedIcon fontSize="small" />}
                      disabled={isInstanceCancelled || cancellingInstanciaKey === instanceKey || isRestoreInProgress}
                      onClick={() =>
                        onCancelSolicitudInstancia({
                          solicitudId: item.id,
                          titulo: item.titulo,
                          eventoId: instance.eventId ?? undefined,
                          occurrenceId: instance.occurrenceId ?? undefined,
                          startTime: instance.startTime
                        })
                      }
                    >
                      {cancellingInstanciaKey === instanceKey ? "Cancelando..." : "Cancelar instancia"}
                    </Button>
                  )}
                  {canRestoreThisInstance && (
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<RestoreFromTrashOutlinedIcon fontSize="small" />}
                      disabled={isRestoreInProgress || cancellingInstanciaKey === instanceKey}
                      onClick={() =>
                        onRestoreSolicitudInstancia({
                          solicitudId: item.id,
                          titulo: item.titulo,
                          eventoId: instance.eventId ?? undefined,
                          startTime: instance.startTime
                        })
                      }
                    >
                      {isRestoreInProgress ? "Sincronizando..." : "Descancelar instancia"}
                    </Button>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      );
    }

    return (
      <Stack spacing={1.4}>
        {activeOrFinalizedInstances.length > 0 ? renderInstanceRows(activeOrFinalizedInstances) : null}

        {cancelledInstances.length > 0 ? (
          <Box sx={{ pt: 0.4, borderTop: "1px dashed", borderColor: "divider" }}>
            <Button
              type="button"
              size="small"
              variant="text"
              color="error"
              onClick={() =>
                setShowCancelledBySolicitudId((prev) => ({
                  ...prev,
                  [item.id]: !prev[item.id]
                }))
              }
              sx={{ px: 0.2, minWidth: 0, textTransform: "none", fontWeight: 700 }}
            >
              {showCancelledBySolicitudId[item.id]
                ? `Ocultar canceladas (${cancelledInstances.length})`
                : `Mostrar canceladas (${cancelledInstances.length})`}
            </Button>
            {showCancelledBySolicitudId[item.id] ? (
              <Box sx={{ mt: 0.8 }}>
                {renderInstanceRows(cancelledInstances, { muted: true, withNumbering: false })}
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Stack>
    );
  }

  const addInstanceStartDate = addInstanceStartLocal ? new Date(addInstanceStartLocal) : null;
  const addInstanceEndDate = addInstanceEndLocal ? new Date(addInstanceEndLocal) : null;
  const addInstanceStartDay = extractLocalDatePart(addInstanceStartLocal);
  const addInstanceEndDay = extractLocalDatePart(addInstanceEndLocal);
  const isAddInstanceSameDay = Boolean(
    addInstanceStartDay &&
    addInstanceEndDay &&
    addInstanceStartDay === addInstanceEndDay
  );
  const isAddInstanceChronological = Boolean(
    addInstanceStartDate &&
    addInstanceEndDate &&
    !Number.isNaN(addInstanceStartDate.getTime()) &&
    !Number.isNaN(addInstanceEndDate.getTime()) &&
    addInstanceEndDate.getTime() > addInstanceStartDate.getTime()
  );
  const isAddInstanceRangeValid = isAddInstanceSameDay && isAddInstanceChronological;
  const isSubmittingAddInstance = Boolean(
    addInstanceDialogSolicitud &&
    addingInstanceSolicitudId === addInstanceDialogSolicitud.id
  );
  const [addInstanceBusyIndex, setAddInstanceBusyIndex] = useState(0);
  const addInstanceBusyLabel =
    ADD_INSTANCE_BUSY_MESSAGES[addInstanceBusyIndex] ?? ADD_INSTANCE_BUSY_MESSAGES[0];

  useEffect(() => {
    setAddInstanceBusyIndex(0);
    if (!isSubmittingAddInstance) return;
    if (ADD_INSTANCE_BUSY_MESSAGES.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setAddInstanceBusyIndex((prev) => (prev + 1) % ADD_INSTANCE_BUSY_MESSAGES.length);
    }, 1800);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isSubmittingAddInstance]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            Solicitudes de sala
          </Typography>
          {canCreateShortcut && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                type="button"
                variant={docenteSolicitudesView === "list" ? "contained" : "outlined"}
                onClick={() => setDocenteSolicitudesView("list")}
              >
                Ver solicitudes
              </Button>
              <Button
                type="button"
                variant={docenteSolicitudesView === "form" ? "contained" : "outlined"}
                onClick={() => setDocenteSolicitudesView("form")}
              >
                Nueva solicitud
              </Button>
            </Stack>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Listado de solicitudes con estado, solicitante e informacion de reunion.
        </Typography>

      {canCreateShortcut && docenteSolicitudesView === "form" ? (
        <Box component="form" onSubmit={onSubmit} sx={{ display: "grid", gap: 1.2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
            Seccion 1 de 3 - Datos generales
          </Typography>
          <TextField
            label="Tema"
            required
            fullWidth
            value={form.tema}
            onChange={(e) => updateForm("tema", e.target.value)}
            placeholder="Nombre del Seminario / Clase / Reunion"
            sx={{ mt: 0.2 }}
          />
          {canDelegateResponsable ? (
            <TextField
              label="Persona responsable"
              required
              fullWidth
              select
              value={form.responsable}
              onChange={(e) => updateForm("responsable", e.target.value)}
              helperText="Por defecto es quien hace la peticion. Como admin, puedes delegarla a otro docente o admin."
            >
              {responsableOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
              {form.responsable.trim() &&
                !responsableOptions.some((option) => option.value === form.responsable) && (
                  <MenuItem value={form.responsable}>{form.responsable}</MenuItem>
                )}
            </TextField>
          ) : (
            <TextField
              label="Persona responsable"
              required
              fullWidth
              value={form.responsable}
              onChange={(e) => updateForm("responsable", e.target.value)}
              helperText="Corresponde a quien hace la peticion."
            />
          )}
          <TextField
            label="Correo vinculado"
            required
            fullWidth
            select
            value={form.correoVinculado}
            onChange={(e) => updateForm("correoVinculado", e.target.value)}
            helperText={
              linkedEmailOptions.length > 1
                ? "Este correo quedara vinculado a la reunion para su gestion."
                : "Se usara este correo para vincular la reunion."
            }
          >
            {linkedEmailOptions.length === 0 ? (
              <MenuItem value="" disabled>
                Sin correos disponibles
              </MenuItem>
            ) : null}
            {linkedEmailOptions.map((email) => (
              <MenuItem key={email} value={email}>
                {email}
              </MenuItem>
            ))}
            {form.correoVinculado.trim() &&
            !linkedEmailOptions.some((email) => email === form.correoVinculado.trim().toLowerCase()) ? (
              <MenuItem value={form.correoVinculado.trim().toLowerCase()}>
                {form.correoVinculado.trim().toLowerCase()}
              </MenuItem>
            ) : null}
          </TextField>
          <TextField
            label="Programa"
            required
            fullWidth
            select
            value={form.programa}
            disabled={isCreatingPrograma}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (nextValue !== CREATE_PROGRAMA_VALUE) {
                updateForm("programa", nextValue);
                return;
              }

              setNewProgramaNombre("");
              setCreateProgramaOpen(true);
            }}
            helperText={
              programaOptions.length === 0
                ? "No hay programas cargados. Usa la opcion para crear uno."
                : undefined
            }
          >
            {programaOptions.map((programa) => (
              <MenuItem key={programa} value={programa}>
                {programa}
              </MenuItem>
            ))}
            <MenuItem value={CREATE_PROGRAMA_VALUE}>+ Crear programa</MenuItem>
          </TextField>

          <ToggleButtons
            label="Asistencia Zoom"
            value={form.asistenciaZoom}
            onChange={(val) => updateForm("asistenciaZoom", val as SolicitudFormState["asistenciaZoom"])}
          />

          <ToggleButtons
            label="Modalidad"
            name="solicitud-modalidad"
            value={form.modalidad}
            onChange={(val) => updateForm("modalidad", val as SolicitudFormState["modalidad"])}
            options={[
              { value: "VIRTUAL", label: "Virtual" },
              { value: "HIBRIDA", label: "Hibrida" }
            ]}
          />

          <ToggleButtons
            label="Grabacion"
            name="solicitud-grabacion"
            value={form.grabacion}
            onChange={(val) => updateForm("grabacion", val as SolicitudFormState["grabacion"])}
            options={[
              { value: "SI", label: "Si" },
              { value: "NO", label: "No" },
              { value: "DEFINIR", label: "A definir" }
            ]}
          />

          <ToggleButtons
            label="Una o varias reuniones"
            name="solicitud-instancias"
            value={form.unaOVarias}
            onChange={(val) => updateForm("unaOVarias", val as SolicitudFormState["unaOVarias"])}
            options={[
              { value: "UNA", label: "Una sola" },
              { value: "VARIAS", label: "Varias" }
            ]}
          />

          {form.unaOVarias === "UNA" ? (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.8 }}>
                Seccion 2 de 3 - Reunion unica
              </Typography>
              <TextField
                label="Descripcion (opcional)"
                multiline
                minRows={3}
                fullWidth
                value={form.descripcionUnica}
                onChange={(e) => updateForm("descripcionUnica", e.target.value)}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label="Dia de comienzo"
                  type="date"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.diaUnica}
                  onChange={(e) => updateForm("diaUnica", e.target.value)}
                />
                <TextField
                  label="Hora de comienzo"
                  type="time"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaInicioUnica}
                  onChange={(e) => handleUniqueStartChange(e.target.value)}
                />
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label="Hora de fin"
                  type="time"
                  required={!form.duracionUnica}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaFinUnica}
                  onChange={(e) => handleUniqueEndChange(e.target.value)}
                />
                <TextField
                  label="Duracion (minutos)"
                  type="number"
                  required={!form.horaFinUnica}
                  fullWidth
                  inputProps={{ min: 15, step: 15 }}
                  value={form.duracionUnica}
                  onChange={(e) => handleUniqueDurationChange(e.target.value)}
                />
              </Box>
            </>
          ) : (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.8 }}>
                Seccion 3 de 3 - Reuniones periodicas
              </Typography>
              <TextField
                label="Descripcion (opcional)"
                multiline
                minRows={3}
                fullWidth
                value={form.descripcionRecurrente}
                onChange={(e) => updateForm("descripcionRecurrente", e.target.value)}
              />

              <ToggleButtons
                label="Modo para varias reuniones"
                name="solicitud-varias-modo"
                value={form.variasModo}
                onChange={(val) => updateForm("variasModo", val as SolicitudFormState["variasModo"])}
                options={[
                  { value: "FECHAS_ESPECIFICAS", label: "Día por día" },
                  { value: "RECURRENCIA_ZOOM", label: "Recurrencia Zoom" }
                ]}
              />

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label={form.variasModo === "FECHAS_ESPECIFICAS" ? "Hora de comienzo (por defecto)" : "Hora de comienzo"}
                  type="time"
                  required={form.variasModo === "RECURRENCIA_ZOOM"}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaInicioRecurrente}
                  onChange={(e) => handleRecurringStartChange(e.target.value)}
                />
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label={form.variasModo === "FECHAS_ESPECIFICAS" ? "Hora de fin (por defecto)" : "Hora de fin"}
                  type="time"
                  required={form.variasModo === "RECURRENCIA_ZOOM" && !form.duracionRecurrente}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaFinRecurrente}
                  onChange={(e) => handleRecurringEndChange(e.target.value)}
                />
                <TextField
                  label={form.variasModo === "FECHAS_ESPECIFICAS" ? "Duracion (minutos, por defecto)" : "Duracion (minutos)"}
                  type="number"
                  required={form.variasModo === "RECURRENCIA_ZOOM" && !form.horaFinRecurrente}
                  fullWidth
                  inputProps={{ min: 15, step: 15 }}
                  value={form.duracionRecurrente}
                  onChange={(e) => handleRecurringDurationChange(e.target.value)}
                />
              </Box>

              {form.variasModo === "RECURRENCIA_ZOOM" ? (
                <>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 1.2
                    }}
                  >
                    <TextField
                      label="Primer dia"
                      type="date"
                      required
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={form.primerDiaRecurrente}
                      onChange={(e) => updateForm("primerDiaRecurrente", e.target.value)}
                    />
                  </Box>

                  <ToggleButtons
                    label="Recurrencia (Zoom)"
                    name="solicitud-recurrencia-zoom"
                    value={form.recurrenciaTipoZoom}
                    onChange={(val) => updateForm("recurrenciaTipoZoom", val as ZoomRecurrenceType)}
                    options={[
                      { value: "1", label: "Diaria" },
                      { value: "2", label: "Semanal" },
                      { value: "3", label: "Mensual" }
                    ]}
                  />

                  <TextField
                    label="Intervalo"
                    type="number"
                    required
                    fullWidth
                    inputProps={{
                      min: 1,
                      max: form.recurrenciaTipoZoom === "1" ? 90 : form.recurrenciaTipoZoom === "2" ? 12 : 3,
                      step: 1
                    }}
                    value={form.recurrenciaIntervalo}
                    onChange={(e) => updateForm("recurrenciaIntervalo", e.target.value)}
                    helperText={
                      form.recurrenciaTipoZoom === "1"
                        ? "Zoom diario: maximo cada 90 dias."
                        : form.recurrenciaTipoZoom === "2"
                          ? "Zoom semanal: maximo cada 12 semanas."
                          : "Zoom mensual: maximo cada 3 meses."
                    }
                  />

                  {form.recurrenciaTipoZoom === "2" && (
                    <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.6 }}>
                        Dias de la semana
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                          gap: 0.6
                        }}
                      >
                        {zoomWeekdayOptionsFull.map((dayOption) => {
                          const checked = parseWeekdaysCsv(form.recurrenciaDiasSemana).includes(Number(dayOption.value));
                          return (
                            <FormControlLabel
                              key={dayOption.value}
                              control={
                                <Checkbox
                                  checked={checked}
                                  onChange={(e) => {
                                    const current = parseWeekdaysCsv(form.recurrenciaDiasSemana);
                                    const value = Number(dayOption.value);
                                    const next = e.target.checked
                                      ? [...new Set([...current, value])]
                                      : current.filter((day) => day !== value);
                                    updateForm("recurrenciaDiasSemana", next.sort((a, b) => a - b).join(","));
                                  }}
                                />
                              }
                              label={dayOption.label}
                            />
                          );
                        })}
                      </Box>
                    </Paper>
                  )}

                  {form.recurrenciaTipoZoom === "3" && (
                    <>
                      <ToggleButtons
                        label="Modo mensual"
                        name="solicitud-modo-mensual"
                        value={form.recurrenciaMensualModo}
                        onChange={(val) => updateForm("recurrenciaMensualModo", val as ZoomMonthlyMode)}
                        options={[
                          { value: "DAY_OF_MONTH", label: "Dia del mes" },
                          { value: "WEEKDAY_OF_MONTH", label: "Dia de semana" }
                        ]}
                      />
                      {form.recurrenciaMensualModo === "DAY_OF_MONTH" ? (
                        <TextField
                          label="Dia del mes (1-31)"
                          type="number"
                          required
                          fullWidth
                          inputProps={{ min: 1, max: 31, step: 1 }}
                          value={form.recurrenciaDiaMes}
                          onChange={(e) => updateForm("recurrenciaDiaMes", e.target.value)}
                        />
                      ) : (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: 1.2
                          }}
                        >
                          <TextField
                            label="Semana del mes"
                            select
                            fullWidth
                            value={form.recurrenciaSemanaMes}
                            onChange={(e) => updateForm("recurrenciaSemanaMes", e.target.value)}
                          >
                            {zoomMonthlyWeekOptions.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            label="Dia de semana"
                            select
                            fullWidth
                            value={form.recurrenciaDiaSemanaMes}
                            onChange={(e) => updateForm("recurrenciaDiaSemanaMes", e.target.value)}
                          >
                            {zoomWeekdayOptionsFull.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        </Box>
                      )}
                    </>
                  )}

                  <TextField
                    label="Fecha final"
                    type="date"
                    required
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={form.fechaFinal}
                    onChange={(e) => updateForm("fechaFinal", e.target.value)}
                  />

                  <Paper
                    variant="outlined"
                    sx={{ mb: 1, p: 1.2, borderRadius: 2, backgroundColor: "grey.50" }}
                  >
                    <Typography variant="subtitle2">Previsualizacion de fechas</Typography>
                    {recurrencePreview.error ? (
                      <Typography variant="body2" color="error.main" sx={{ mt: 0.8 }}>
                        {recurrencePreview.error}
                      </Typography>
                    ) : recurrencePreview.dates.length > 0 ? (
                      <>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8, mb: 0.8 }}>
                          Se crearan {recurrencePreview.dates.length} instancia(s).
                        </Typography>
                        <Box sx={{ display: "grid", gap: 0.5, maxHeight: 220, overflowY: "auto" }}>
                          {recurrencePreview.dates.map((date, index) => (
                            <Typography key={`${date.toISOString()}-${index}`} variant="body2">
                              {index + 1}. {formatDateTime(date.toISOString())}
                            </Typography>
                          ))}
                        </Box>
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                        Completa primer dia, hora de comienzo y fecha final para ver la previsualizacion.
                      </Typography>
                    )}
                  </Paper>
                </>
              ) : (
                <>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} alignItems={{ sm: "flex-end" }}>
                    <TextField
                      label="Fecha puntual"
                      type="date"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={specificDateInput}
                      onChange={(e) => setSpecificDateInput(e.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        handleAddSpecificDate();
                      }}
                    />
                    <Button
                      type="button"
                      variant="contained"
                      startIcon={<AddIcon />}
                      disabled={!specificDateInput}
                      onClick={handleAddSpecificDate}
                      sx={{ minWidth: { sm: 170 } }}
                    >
                      Agregar fecha
                    </Button>
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    Agrega las fechas una por una con el boton + y ajusta horario en cada fecha.
                  </Typography>

                  <Paper
                    variant="outlined"
                    sx={{ mb: 1, p: 1.2, borderRadius: 2, backgroundColor: "grey.50" }}
                  >
                    <Typography variant="subtitle2">Fechas puntuales cargadas</Typography>
                    {specificDatesPreview.error ? (
                      <Typography variant="body2" color="error.main" sx={{ mt: 0.8 }}>
                        {specificDatesPreview.error}
                      </Typography>
                    ) : specificDatesPreview.dates.length > 0 ? (
                      <>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8, mb: 0.8 }}>
                          Se creara una recurrencia en Zoom con un unico ID y se ajustaran las ocurrencias necesarias.
                        </Typography>
                        <Box sx={{ display: "grid", gap: 0.6, maxHeight: 260, overflowY: "auto" }}>
                          {specificDatesPreview.dates.map((dateIso, index) => (
                            <Paper
                              key={`${dateIso}-${index}`}
                              variant="outlined"
                              sx={{
                                px: 1,
                                py: 0.8,
                                display: "grid",
                                gridTemplateColumns: { xs: "1fr", md: "minmax(180px, 1fr) minmax(140px, 180px) minmax(140px, 180px) auto" },
                                alignItems: "center",
                                gap: 1
                              }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {index + 1}. {formatDateTime(`${dateIso}T00:00`)}
                              </Typography>
                              <TextField
                                type="time"
                                size="small"
                                label="Inicio"
                                InputLabelProps={{ shrink: true }}
                                value={(specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback()).horaInicio}
                                onChange={(event) => handleSpecificDateStartChange(dateIso, event.target.value)}
                              />
                              <TextField
                                type="time"
                                size="small"
                                label="Fin"
                                InputLabelProps={{ shrink: true }}
                                value={(specificDateDetails[dateIso] ?? buildSpecificDateDetailFallback()).horaFin}
                                onChange={(event) => handleSpecificDateEndChange(dateIso, event.target.value)}
                              />
                              <Button
                                type="button"
                                size="small"
                                color="inherit"
                                startIcon={<DeleteOutlineIcon fontSize="small" />}
                                onClick={() => handleRemoveSpecificDate(dateIso)}
                              >
                                Quitar
                              </Button>
                            </Paper>
                          ))}
                        </Box>
                        {specificDatesScheduleError ? (
                          <Typography variant="body2" color="error.main" sx={{ mt: 0.8 }}>
                            {specificDatesScheduleError}
                          </Typography>
                        ) : null}
                        {specificDatesPreview.dates.length < 2 ? (
                          <Typography variant="body2" color="warning.main" sx={{ mt: 0.8 }}>
                            Agrega al menos 2 fechas para enviar la solicitud.
                          </Typography>
                        ) : null}
                      </>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                        Todavia no agregaste fechas.
                      </Typography>
                    )}
                  </Paper>
                </>
              )}
            </>
          )}

          <TextField
            label="Copiar tambien a (opcional)"
            multiline
            minRows={3}
            fullWidth
            value={form.correosDocentes}
            onChange={(e) => updateForm("correosDocentes", normalizeEmailInputAsLines(e.target.value))}
            placeholder={"docente1@flacso.edu.uy\ndocente2@flacso.edu.uy"}
            helperText="Se enviara copia del correo de confirmacion. Ingresa un email por linea."
            sx={{ mt: 1 }}
          />

          <Button
            type="submit"
            variant="contained"
            disabled={isSubmittingSolicitud || isSpecificDatesModeInvalid}
          >
            {isSubmittingSolicitud ? "Enviando solicitud..." : "Enviar solicitud"}
          </Button>

          <Dialog
            open={createProgramaOpen}
            onClose={() => {
              if (isCreatingPrograma) return;
              setCreateProgramaOpen(false);
            }}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>Crear programa</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                margin="dense"
                label="Nombre del nuevo programa"
                fullWidth
                value={newProgramaNombre}
                onChange={(event) => setNewProgramaNombre(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const normalized = newProgramaNombre.trim();
                  if (!normalized || isCreatingPrograma) return;
                  const createdProgram = await onCreatePrograma(normalized);
                  if (createdProgram) {
                    updateForm("programa", createdProgram);
                    setCreateProgramaOpen(false);
                    setNewProgramaNombre("");
                  }
                }}
                disabled={isCreatingPrograma}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  if (isCreatingPrograma) return;
                  setCreateProgramaOpen(false);
                }}
                disabled={isCreatingPrograma}
              >
                Cancelar
              </Button>
              <Button
                variant="contained"
                disabled={!newProgramaNombre.trim() || isCreatingPrograma}
                onClick={async () => {
                  const normalized = newProgramaNombre.trim();
                  if (!normalized) return;
                  const createdProgram = await onCreatePrograma(normalized);
                  if (createdProgram) {
                    updateForm("programa", createdProgram);
                    setCreateProgramaOpen(false);
                    setNewProgramaNombre("");
                  }
                }}
              >
                {isCreatingPrograma ? "Creando..." : "Crear"}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      ) : null}

      {(docenteSolicitudesView === "list" || !canCreateShortcut) && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Listado de solicitudes
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1.5 }}>
            <Button
              type="button"
              size="small"
              variant={solicitudesListScope === "ACTIVAS" ? "contained" : "outlined"}
              onClick={() => {
                setSolicitudesListScope("ACTIVAS");
                setExpandedSolicitudId(null);
              }}
            >
              Activas / por ocurrir ({solicitudesByLifecycle.activas.length})
            </Button>
            <Button
              type="button"
              size="small"
              variant={solicitudesListScope === "FINALIZADAS" ? "contained" : "outlined"}
              onClick={() => {
                setSolicitudesListScope("FINALIZADAS");
                setExpandedSolicitudId(null);
              }}
            >
              Finalizadas ({solicitudesByLifecycle.finalizadas.length})
            </Button>
          </Stack>
          {solicitudes.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No hay solicitudes registradas.
            </Typography>
          )}
          {solicitudes.length > 0 && visibleSolicitudes.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {solicitudesListScope === "ACTIVAS"
                ? "No hay solicitudes activas o pendientes de ocurrir."
                : "No hay solicitudes con todas sus instancias finalizadas."}
            </Typography>
          )}
          {visibleSolicitudes.length > 0 && (
            <Stack spacing={1.4}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "repeat(3, minmax(0, 1fr))",
                    lg: "repeat(6, minmax(0, 1fr))"
                  },
                  gap: 1
                }}
              >
                <Paper variant="outlined" sx={{ p: 1.2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total (vista)
                  </Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                    {visibleSolicitudes.length}
                  </Typography>
                </Paper>
                {statusSummary.map((summary) => (
                  <Paper key={summary.estado} variant="outlined" sx={{ p: 1.2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {summary.label}
                    </Typography>
                    <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                      {summary.count}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              <Stack spacing={1.2}>
                {visibleSolicitudes.map((item) => {
                  const joinUrl =
                    item.zoomJoinUrl ??
                    item.zoomInstances?.find((instance) => instance.joinUrl)?.joinUrl ??
                    null;
                  const instanceCount = item.zoomInstanceCount ?? item.zoomInstances?.length ?? 1;
                  const instances = item.zoomInstances ?? [];
                  const isExpanded = expandedSolicitudId === item.id;
                  const accountLabel =
                    [
                      item.zoomHostAccount,
                      item.cuentaZoomAsignada?.ownerEmail,
                      item.cuentaZoomAsignada?.nombreCuenta
                    ].find((candidate) => {
                      const normalized = (candidate ?? "").trim();
                      if (!normalized) return false;
                      return !normalized.toLowerCase().includes("flacso.local");
                    }) ?? "-";
                  const accountColor = getZoomAccountColor(accountLabel);
                  const requesterLabel = item.requestedBy?.name || item.requestedBy?.email || "-";
                  const responsableLabel = item.responsableNombre?.trim() || requesterLabel;
                  const hostAccountForPassword = accountLabel === "-" ? null : accountLabel;
                  const meetingIdDisplay =
                    item.estadoSolicitud === "PENDIENTE_RESOLUCION_MANUAL_ID"
                      ? "Pendiente"
                      : item.meetingPrincipalId || "-";
                  const solicitudRequiresAssistance = Boolean(
                    item.requiereAsistencia ?? item.requiresAsistencia
                  );
                  const solicitudStatus = mapSolicitudStatus(resolveSolicitudStatusCode(item));
                  const isSolicitudCancelled = isSolicitudCancelledStatus(item.estadoSolicitud);
                  const statusAccent =
                    solicitudStatus.color === "success"
                      ? "success.main"
                      : solicitudStatus.color === "warning"
                        ? "warning.main"
                        : solicitudStatus.color === "error"
                          ? "error.main"
                          : solicitudStatus.color === "info"
                            ? "info.main"
                            : "grey.400";
                  const sortedInstances = [...instances].sort(
                    (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
                  );
                  const highlightedInstance =
                    solicitudesListScope === "ACTIVAS"
                      ? sortedInstances.find((instance) => new Date(instance.startTime).getTime() >= Date.now()) ??
                        sortedInstances[0]
                      : sortedInstances[sortedInstances.length - 1];
                  const instanceTimeLabel =
                    solicitudesListScope === "ACTIVAS" ? "Proxima instancia" : "Ultima instancia";
                  const hasEligibleInstanceForAssistance = sortedInstances.some((instance) =>
                    isInstanceActiveOrUpcoming(instance, Date.now())
                  );
                  const assignedAssistantEmailsUpcoming = Array.from(
                    new Set(
                      sortedInstances
                        .filter((instance) => isInstanceActiveOrUpcoming(instance, Date.now()))
                        .map((instance) => (instance.monitorEmail ?? "").trim().toLowerCase())
                        .filter((email) => isLikelyEmail(email))
                    )
                  );
                  const assignedAssistantEmailsAny = Array.from(
                    new Set(
                      sortedInstances
                        .map((instance) => (instance.monitorEmail ?? "").trim().toLowerCase())
                        .filter((email) => isLikelyEmail(email))
                    )
                  );
                  const assignedAssistantEmails =
                    assignedAssistantEmailsUpcoming.length > 0
                      ? assignedAssistantEmailsUpcoming
                      : assignedAssistantEmailsAny;
                  const assignedAssistantEmail =
                    assignedAssistantEmails.length === 1 ? assignedAssistantEmails[0] : null;
                  const assignedAssistantNamesUpcoming = Array.from(
                    new Set(
                      sortedInstances
                        .filter((instance) => isInstanceActiveOrUpcoming(instance, Date.now()))
                        .map((instance) => (instance.monitorNombre ?? "").trim())
                        .filter(Boolean)
                    )
                  );
                  const assignedAssistantNamesAny = Array.from(
                    new Set(
                      sortedInstances
                        .map((instance) => (instance.monitorNombre ?? "").trim())
                        .filter(Boolean)
                    )
                  );
                  const assignedAssistantNames =
                    assignedAssistantNamesUpcoming.length > 0
                      ? assignedAssistantNamesUpcoming
                      : assignedAssistantNamesAny;
                  const hasMultipleAssistants =
                    assignedAssistantEmails.length > 1 || assignedAssistantNames.length > 1;
                  const highlightedAssistantName = (highlightedInstance?.monitorNombre ?? "").trim();
                  const highlightedAssistantEmail = (highlightedInstance?.monitorEmail ?? "").trim().toLowerCase();
                  const assistantNameForStatus =
                    highlightedAssistantName ||
                    (assignedAssistantNames.length === 1 ? assignedAssistantNames[0] : "");
                  const assistantEmailForStatus =
                    highlightedAssistantEmail ||
                    (assignedAssistantEmails.length === 1 ? assignedAssistantEmails[0] : "");
                  const canSendAssistantAccess =
                    canSendReminder &&
                    solicitudRequiresAssistance &&
                    !isSolicitudCancelled &&
                    Boolean(assignedAssistantEmail);
                  const assistantAccessLabel = assignedAssistantEmail
                    ? "Enviar acceso asistente"
                    : assignedAssistantEmails.length > 1
                      ? "Varios asistentes asignados"
                      : "Sin asistente asignado";
                  const assistantAccessTitle = assignedAssistantEmail
                    ? `Enviar datos de acceso a ${assignedAssistantEmail}`
                    : assignedAssistantEmails.length > 1
                      ? "Hay mas de un asistente asignado. Usa Enviar recordatorio para elegir destinatario."
                      : "Primero debes asignar una persona de asistencia Zoom.";
                  const showAddInstanceAction = canAddInstances && !isSolicitudCancelled;
                  const showEditAssistanceAction =
                    canEditAssistance &&
                    !isSolicitudCancelled &&
                    (solicitudRequiresAssistance || hasEligibleInstanceForAssistance);
                  const showReminderAction = canSendReminder;
                  const showAssistantAccessAction = solicitudRequiresAssistance && canSendReminder;
                  const hasPrimaryActions = Boolean(joinUrl) || showAddInstanceAction || showEditAssistanceAction;

                  return (
                    <Paper
                      key={item.id}
                      variant="outlined"
                      sx={{
                        borderRadius: 2.2,
                        overflow: "hidden",
                        borderLeft: "6px solid",
                        borderLeftColor: statusAccent
                      }}
                    >
                      <Box sx={{ p: { xs: 1.3, sm: 1.7 } }}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", md: "center" }}
                          sx={{ mb: 1 }}
                        >
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {item.titulo}
                            </Typography>
                            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                              <Chip size="small" color={solicitudStatus.color} label={solicitudStatus.label} />
                              <Chip size="small" variant="outlined" label={`${instanceCount} instancia(s)`} />
                              <Chip size="small" variant="outlined" label={item.modalidadReunion} />
                            </Stack>
                          </Box>
                          <Stack
                            spacing={0.8}
                            sx={{
                              width: { xs: "100%", md: "auto" },
                              alignItems: { xs: "stretch", md: "flex-end" }
                            }}
                          >
                            {hasPrimaryActions ? (
                              <Stack
                                direction="row"
                                spacing={0.8}
                                useFlexGap
                                flexWrap="wrap"
                                justifyContent={{ xs: "flex-start", md: "flex-end" }}
                              >
                                {joinUrl ? (
                                  <Button
                                    size="small"
                                    variant="contained"
                                    color="secondary"
                                    href={joinUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    endIcon={<LaunchIcon fontSize="small" />}
                                  >
                                    Abrir
                                  </Button>
                                ) : null}
                                {showAddInstanceAction ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon fontSize="small" />}
                                    onClick={() => openAddInstanceDialog(item, sortedInstances)}
                                    disabled={Boolean(addingInstanceSolicitudId)}
                                  >
                                    {addingInstanceSolicitudId === item.id ? "Guardando..." : "Agregar instancia"}
                                  </Button>
                                ) : null}
                                {showEditAssistanceAction ? (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<EditOutlinedIcon fontSize="small" />}
                                    color={solicitudRequiresAssistance ? "warning" : "primary"}
                                    onClick={() =>
                                      onEnableAssistance({
                                        solicitudId: item.id,
                                        titulo: item.titulo,
                                        requiereAsistencia: solicitudRequiresAssistance
                                      })
                                    }
                                    disabled={Boolean(updatingAssistanceSolicitudId)}
                                  >
                                    {updatingAssistanceSolicitudId === item.id
                                      ? "Guardando..."
                                      : solicitudRequiresAssistance
                                        ? "Quitar asistencia"
                                        : "Habilitar asistencia"}
                                  </Button>
                                ) : null}
                              </Stack>
                            ) : null}

                            <Stack
                              direction="row"
                              spacing={0.8}
                              useFlexGap
                              flexWrap="wrap"
                              justifyContent={{ xs: "flex-start", md: "flex-end" }}
                            >
                              {showReminderAction ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<MailOutlineOutlinedIcon fontSize="small" />}
                                  onClick={() => openReminderDialog(item)}
                                  disabled={Boolean(sendingReminderSolicitudId)}
                                >
                                  {sendingReminderSolicitudId === item.id ? "Enviando..." : "Enviar recordatorio"}
                                </Button>
                              ) : null}
                              {showAssistantAccessAction ? (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="secondary"
                                  startIcon={<MailOutlineOutlinedIcon fontSize="small" />}
                                  onClick={() => {
                                    if (!assignedAssistantEmail) return;
                                    void onSendReminder({
                                      solicitudId: item.id,
                                      toEmail: assignedAssistantEmail,
                                      mensaje:
                                        "Este correo incluye todos los datos de acceso para tu asistencia Zoom asignada."
                                    });
                                  }}
                                  disabled={Boolean(sendingReminderSolicitudId) || !canSendAssistantAccess}
                                  title={assistantAccessTitle}
                                >
                                  {sendingReminderSolicitudId === item.id ? "Enviando..." : assistantAccessLabel}
                                </Button>
                              ) : null}
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() =>
                                  setExpandedSolicitudId((prev) => (prev === item.id ? null : item.id))
                                }
                                disabled={instances.length === 0}
                                endIcon={isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                              >
                                {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                              </Button>
                            </Stack>
                          </Stack>
                        </Stack>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              sm: "repeat(2, minmax(0, 1fr))",
                              lg: "repeat(3, minmax(0, 1fr))"
                            },
                            gap: 1
                          }}
                        >
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Solicitado por
                            </Typography>
                            <Typography variant="body2">{requesterLabel}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Responsable
                            </Typography>
                            <Typography variant="body2">{responsableLabel}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Cuenta streaming asociada
                            </Typography>
                            <Stack direction="row" spacing={0.8} alignItems="center">
                              <Box
                                aria-hidden
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  backgroundColor: accountColor,
                                  border: "1px solid",
                                  borderColor: "divider",
                                  flexShrink: 0
                                }}
                              />
                              <Typography variant="body2">{accountLabel}</Typography>
                            </Stack>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Cantidad de reuniones
                            </Typography>
                            <Typography variant="body2">
                              {instanceCount} {instanceCount === 1 ? "instancia" : "instancias"}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              {instanceTimeLabel}
                            </Typography>
                            <Typography variant="body2">
                              {highlightedInstance ? formatDateTime(highlightedInstance.startTime) : "Sin instancias"}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              ID de reunion
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                              {meetingIdDisplay}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Asistente Zoom
                            </Typography>
                            <MeetingAssistantStatusChip
                              requiresAssistance={solicitudRequiresAssistance}
                              assistantName={assistantNameForStatus}
                              assistantEmail={assistantEmailForStatus}
                              multipleAssistants={hasMultipleAssistants}
                              pendingLabel="Pendiente"
                            />
                          </Box>
                          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
                            <ZoomAccountPasswordField
                              hostAccount={hostAccountForPassword}
                              label="Contrasena cuenta streaming"
                            />
                          </Box>
                        </Box>

                        {canDeleteSolicitud && (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.2 }}>
                            <Button
                              type="button"
                              size="small"
                              variant="outlined"
                              color="warning"
                              startIcon={<CancelScheduleSendOutlinedIcon fontSize="small" />}
                              disabled={isSolicitudCancelled || cancellingSerieSolicitudId === item.id}
                              onClick={() => onCancelSolicitudSerie(item.id, item.titulo)}
                            >
                              {cancellingSerieSolicitudId === item.id
                                ? "Cancelando..."
                                : instanceCount > 1
                                  ? "Cancelar serie"
                                  : "Cancelar reunion"}
                            </Button>
                            <Button
                              type="button"
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<DeleteOutlineIcon fontSize="small" />}
                              onClick={() => onDeleteSolicitud(item.id)}
                              disabled={deletingSolicitudId === item.id}
                            >
                              {deletingSolicitudId === item.id ? "Eliminando..." : "Eliminar"}
                            </Button>
                          </Stack>
                        )}
                      </Box>

                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, backgroundColor: "grey.50", borderTop: "1px solid", borderColor: "divider" }}>
                          <Typography variant="subtitle2" sx={{ mb: 1.2 }}>
                            Detalle de instancias ({instances.length}) - anfitriona: {accountLabel}
                          </Typography>
                          {renderInstanceList(item, instances, isSolicitudCancelled)}
                        </Box>
                      </Collapse>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          )}
        </Box>
      )}

      <Dialog open={Boolean(addInstanceDialogSolicitud)} onClose={closeAddInstanceDialog} fullWidth maxWidth="sm">
        <DialogTitle>Agregar instancia</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.2 }}>
            Reunion: {addInstanceDialogSolicitud?.titulo || "-"}
          </Typography>
          <TextField
            margin="dense"
            label="Inicio"
            type="datetime-local"
            fullWidth
            value={addInstanceStartLocal}
            onChange={(event) => setAddInstanceStartLocal(event.target.value)}
            disabled={isSubmittingAddInstance}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            margin="dense"
            label="Fin"
            type="datetime-local"
            fullWidth
            value={addInstanceEndLocal}
            onChange={(event) => setAddInstanceEndLocal(event.target.value)}
            disabled={isSubmittingAddInstance}
            InputLabelProps={{ shrink: true }}
          />
          {!isAddInstanceRangeValid ? (
            <Typography variant="caption" color="error" sx={{ mt: 0.8, display: "block" }}>
              {!isAddInstanceSameDay
                ? "Inicio y fin deben estar en el mismo dia."
                : "El fin debe ser posterior al inicio."}
            </Typography>
          ) : null}
          {isSubmittingAddInstance ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                {addInstanceBusyLabel}
              </Typography>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddInstanceDialog} disabled={isSubmittingAddInstance}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitAddInstanceDialog()}
            disabled={!addInstanceDialogSolicitud || !isAddInstanceRangeValid || isSubmittingAddInstance}
            startIcon={<AddIcon fontSize="small" />}
          >
            {isSubmittingAddInstance ? "Guardando..." : "Agregar instancia"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(reminderDialogSolicitud)} onClose={closeReminderDialog} fullWidth maxWidth="sm">
        <DialogTitle>Enviar recordatorio</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.2 }}>
            Solicitud: {reminderDialogSolicitud?.titulo || "-"}
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Destinatario (opcional)"
            type="email"
            fullWidth
            value={reminderToEmail}
            onChange={(event) => setReminderToEmail(event.target.value)}
            helperText="Si queda vacio, se enviara al responsable resuelto por el sistema."
            disabled={Boolean(sendingReminderSolicitudId)}
          />
          <TextField
            margin="dense"
            label="Mensaje adicional (opcional)"
            fullWidth
            multiline
            minRows={3}
            value={reminderMessage}
            onChange={(event) => setReminderMessage(event.target.value)}
            disabled={Boolean(sendingReminderSolicitudId)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReminderDialog} disabled={Boolean(sendingReminderSolicitudId)}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitReminderDialog()}
            disabled={!reminderDialogSolicitud || Boolean(sendingReminderSolicitudId)}
            startIcon={<MailOutlineOutlinedIcon fontSize="small" />}
          >
            {sendingReminderSolicitudId ? "Enviando..." : "Enviar recordatorio"}
          </Button>
        </DialogActions>
      </Dialog>
      </CardContent>
    </Card>
  );
}
