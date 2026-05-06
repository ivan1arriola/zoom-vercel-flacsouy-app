"use client";

import {
  Alert,
  Backdrop,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Skeleton,
  Grid,
  useTheme,
  alpha,
  Paper,
  Avatar
} from "@mui/material";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import BuildCircleIcon from "@mui/icons-material/BuildCircle";
import Groups2Icon from "@mui/icons-material/Groups2";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SchoolIcon from "@mui/icons-material/School";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import TimerIcon from "@mui/icons-material/Timer";
import LockIcon from "@mui/icons-material/Lock";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PaymentsIcon from "@mui/icons-material/Payments";
import LinkIcon from "@mui/icons-material/Link";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import EventNoteIcon from "@mui/icons-material/EventNote";
import GroupIcon from "@mui/icons-material/Group";
import { formatZoomDateTime } from "./spa-tabs-utils";
import type { DashboardSummary } from "@/src/services/dashboardApi";
import {
  downloadMonthlyAccountingReport,
  loadPersonHours,
  loadTarifas,
  uploadMonthlyAccountingReportToDrive,
  type PersonHoursMeeting,
  type PersonHoursPerson,
  type Tarifa
} from "@/src/services/tarifasApi";
import type { AgendaEvent } from "@/src/services/agendaApi";
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";

type DashboardRole = "ADMINISTRADOR" | "DOCENTE" | "ASISTENTE_ZOOM" | "CONTADURIA";
type DashboardMetricKey = Exclude<keyof DashboardSummary, "scope">;

interface SpaTabDashboardProps {
  summary: DashboardSummary | null;
  isLoadingSummary?: boolean;
  onRefresh?: () => void;
  role: DashboardRole;
  agendaLibre?: AgendaEvent[];
  onGoToCreateMeeting?: () => void;
  onGoToAssignAssistants?: () => void;
  onGoToAgendaAvailable?: () => void;
  onGoToMyAssignedMeetings?: () => void;
}

type MetricCardItem = {
  key: DashboardMetricKey;
  title: string;
  description: string;
  semanticColor: keyof typeof SEMANTIC_METRIC_COLORS;
  icon: ReactNode;
  formatValue?: (value: number) => string;
};

type DashboardStatus = {
  label: string;
  color: "success" | "warning" | "error";
  message: string;
};

type DashboardRoleConfig = {
  title: string;
  subtitle: string;
  headerIcon: ReactNode;
  background: string;
  metrics: MetricCardItem[];
  status: DashboardStatus;
  priorityItems: string[];
};

const SEMANTIC_METRIC_COLORS = {
  info: "#0288D1",
  success: "#2E7D32",
  warning: "#ED6C02",
  error: "#D32F2F"
} as const;

function resolveMetricSemanticColor(metric: MetricCardItem, value: number): keyof typeof SEMANTIC_METRIC_COLORS {
  if (value === 0 && (metric.semanticColor === "warning" || metric.semanticColor === "error")) {
    return "info";
  }
  return metric.semanticColor;
}

function metricValue(summary: DashboardSummary, key: DashboardMetricKey): number {
  return typeof summary[key] === "number" ? Number(summary[key]) : 0;
}

function formatHours(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1).replace(".", ",")} h`;
}

function formatMonthKey(monthKey: string): string {
  const [yearRaw = "0", monthRaw = "1"] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return date.toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getPreviousMonthKey(): string {
  const [yearRaw = "0", monthRaw = "1"] = getCurrentMonthKey().split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
}

function toMonthKey(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMoney(value: number, currency: string): string {
  const rounded = Math.round(value * 100) / 100;
  const amount = rounded.toFixed(2).replace(".", ",");
  return currency ? `${currency} ${amount}` : amount;
}

function formatDateTime24(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-UY", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false
  });
}

function normalizeZoomMeetingId(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

function extractZoomMeetingIdFromJoinUrl(joinUrl?: string | null): string | null {
  if (!joinUrl) return null;

  try {
    const url = new URL(joinUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const roomTypeIndex = parts.findIndex((part) => part === "j" || part === "w");
    if (roomTypeIndex < 0 || !parts[roomTypeIndex + 1]) return null;
    return normalizeZoomMeetingId(parts[roomTypeIndex + 1]);
  } catch {
    return null;
  }
}

function resolveMeetingId(meeting: PersonHoursMeeting): string | null {
  return normalizeZoomMeetingId(meeting.zoomMeetingId) ?? extractZoomMeetingIdFromJoinUrl(meeting.zoomJoinUrl);
}

function resolveMeetingJoinUrl(meeting: PersonHoursMeeting): string | null {
  const explicit = (meeting.zoomJoinUrl ?? "").trim();
  if (explicit) return explicit;
  const meetingId = resolveMeetingId(meeting);
  return meetingId ? `https://zoom.us/j/${meetingId}` : null;
}

function resolveMeetingAccount(meeting: PersonHoursMeeting): string | null {
  const candidates = [meeting.zoomHostAccount, meeting.zoomAccountEmail, meeting.zoomAccountName];
  for (const candidate of candidates) {
    const normalized = (candidate ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
}

function isFutureAssignedMeeting(meeting: PersonHoursMeeting, nowMs: number): boolean {
  if (!["ASIGNADO", "ACEPTADO"].includes(meeting.estadoAsignacion)) return false;
  if (meeting.estadoEvento === "CANCELADO") return false;
  if (meeting.isCompleted) return false;

  const start = new Date(meeting.inicioAt).getTime();
  const endRaw = new Date(meeting.finAt).getTime();
  const end = Number.isFinite(endRaw) ? endRaw : start;
  return Number.isFinite(end) && end >= nowMs;
}

function compareMeetingByStartAsc(left: PersonHoursMeeting, right: PersonHoursMeeting): number {
  return new Date(left.inicioAt).getTime() - new Date(right.inicioAt).getTime();
}

function formatTimeUntil(targetIso: string, nowMs: number): string {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) return "Sin horario";

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return "Comienza ahora";

  const totalMinutes = Math.ceil(diffMs / 60000);
  if (totalMinutes < 60) {
    return `En ${totalMinutes} min`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return `En ${totalHours} h ${remainingMinutes} min`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return `En ${days} d ${remainingHours} h`;
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  if (!value) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

function deriveAdminStatus(summary: DashboardSummary): DashboardStatus {
  const manualPendings = metricValue(summary, "manualPendings");
  const solicitudesNoResueltas = metricValue(summary, "solicitudesNoResueltas");
  const colisionesZoom7d = metricValue(summary, "colisionesZoom7d");
  const eventosSinAsistencia7d = metricValue(summary, "eventosSinAsistencia7d");
  
  const totalManual = manualPendings + solicitudesNoResueltas;

  if (colisionesZoom7d > 0) {
    return {
      label: "Conflicto",
      color: "error",
      message: `¡Alerta! Hay ${colisionesZoom7d} colisiones de Zoom detectadas en los próximos 7 días.`
    };
  }

  if (eventosSinAsistencia7d > 0) {
    return {
      label: "Incompleto",
      color: "warning",
      message: `Atención: Hay ${eventosSinAsistencia7d} reuniones sin personal asignado próximamente.`
    };
  }

  if (totalManual > 0 && totalManual !== 1) {
    return {
      label: "Gestión",
      color: "warning",
      message: `Tienes ${totalManual} solicitudes que requieren intervención manual.`
    };
  }

  return {
    label: "Operativo",
    color: "success",
    message: "El sistema se encuentra operando normalmente sin bloqueos críticos."
  };
}

function deriveAssistantStatus(summary: DashboardSummary): DashboardStatus {
  const agendaDisponible = metricValue(summary, "agendaDisponible");
  const misPostulaciones = metricValue(summary, "misPostulaciones");
  const misAsignacionesProximas = metricValue(summary, "misAsignacionesProximas");
  const workload = agendaDisponible * 2 + misPostulaciones + misAsignacionesProximas * 3;

  if (misAsignacionesProximas >= 4 || workload >= 18) {
    return {
      label: "Alta demanda",
      color: "error",
      message: "Tu carga operativa es alta. Conviene revisar agenda y proximas coberturas."
    };
  }

  if (agendaDisponible > 0 || misPostulaciones > 0 || misAsignacionesProximas > 0) {
    return {
      label: "En curso",
      color: "warning",
      message: "Tienes actividad abierta entre agenda, postulaciones o reuniones asignadas."
    };
  }

  return {
    label: "Libre",
    color: "success",
    message: "No tienes pendientes inmediatos de asistencia."
  };
}

function deriveAccountingStatus(summary: DashboardSummary): DashboardStatus {
  const reunionesCompletadasMes = metricValue(summary, "reunionesCompletadasMes");
  const horasCompletadasMes = metricValue(summary, "horasCompletadasMes");
  const personasActivasMes = metricValue(summary, "personasActivasMes");

  if (reunionesCompletadasMes >= 25 || horasCompletadasMes >= 80) {
    return {
      label: "Alta carga",
      color: "warning",
      message: "El mes acumula bastante ejecucion. Conviene revisar cierres y consistencia."
    };
  }

  if (reunionesCompletadasMes > 0 || personasActivasMes > 0) {
    return {
      label: "Con movimiento",
      color: "success",
      message: "Ya hay actividad ejecutada para control y liquidacion."
    };
  }

  return {
    label: "Sin cierres",
    color: "warning",
    message: "Todavia no hay actividad ejecutada en el periodo actual."
  };
}

function deriveDocenteStatus(summary: DashboardSummary): DashboardStatus {
  const solicitudesTotales = metricValue(summary, "solicitudesTotales");
  const solicitudesActivas = metricValue(summary, "solicitudesActivas");
  const proximasReuniones = metricValue(summary, "proximasReuniones");

  if (solicitudesTotales <= 0) {
    return {
      label: "Sin actividad",
      color: "warning",
      message: "Todavia no tienes solicitudes registradas."
    };
  }

  if (solicitudesActivas > 0 || proximasReuniones > 0) {
    return {
      label: "En seguimiento",
      color: "success",
      message: "Tus solicitudes y reuniones proximas estan bajo seguimiento."
    };
  }

  return {
    label: "Al dia",
    color: "success",
    message: "No hay gestiones pendientes visibles en este momento."
  };
}

function buildRoleConfig(role: DashboardRole, summary: DashboardSummary): DashboardRoleConfig {
  if (role === "DOCENTE") {
    return {
      title: "Mi actividad académica",
      subtitle: "Gestión centralizada de tus sesiones y solicitudes de Zoom.",
      headerIcon: <SchoolIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(23,95,161,0.10) 0%, rgba(56,132,255,0.12) 100%)",
      metrics: [
        {
          key: "solicitudesTotales",
          title: "Mis Solicitudes",
          description: "Total de programas o pedidos creados.",
          semanticColor: "info",
          icon: <AssignmentTurnedInIcon fontSize="small" />
        },
        {
          key: "proximasReuniones",
          title: "Próximas Sesiones",
          description: "Cantidad de encuentros sincrónicos.",
          semanticColor: "success",
          icon: <ScheduleIcon fontSize="small" />
        }
      ],
      status: deriveDocenteStatus(summary),
      priorityItems: metricValue(summary, "solicitudesTotales") > 0
        ? [
            `${metricValue(summary, "proximasReuniones")} sesión(es) futura(s) calendarizada(s).`,
            `${metricValue(summary, "reunionesConZoom")} sesión(es) con link de Zoom generado.`
          ]
        : [
            "No hay solicitudes registradas en tu perfil.",
            "Crea una nueva solicitud para iniciar la gestión de tu reunión."
          ]
    };
  }

  if (role === "ASISTENTE_ZOOM") {
    const agendaDisponible = metricValue(summary, "agendaDisponible");
    const misPostulaciones = metricValue(summary, "misPostulaciones");
    const misAsignacionesProximas = metricValue(summary, "misAsignacionesProximas");
    const misHorasMes = metricValue(summary, "misHorasMes");
    const misHorasVirtualesMes = metricValue(summary, "misHorasVirtualesMes");
    const misHorasPresencialesMes = metricValue(summary, "misHorasPresencialesMes");
    const misHorasMesAnterior = metricValue(summary, "misHorasMesAnterior");
    const misHorasVirtualesMesAnterior = metricValue(summary, "misHorasVirtualesMesAnterior");
    const misHorasPresencialesMesAnterior = metricValue(summary, "misHorasPresencialesMesAnterior");

    return {
      title: "Mi panel de asistencia",
      subtitle: "Priorizado para tu proxima reunion y para tomar reuniones disponibles sin asignar.",
      headerIcon: <SupportAgentIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(10,93,72,0.10) 0%, rgba(56,161,105,0.14) 100%)",
      metrics: [
        {
          key: "agendaDisponible",
          title: "Reuniones disponibles",
          description: "Eventos abiertos que todavia pueden tomarse.",
          semanticColor: "success",
          icon: <EventAvailableIcon fontSize="small" />
        },
        {
          key: "misPostulaciones",
          title: "Mis postulaciones",
          description: "Eventos donde marcaste interes.",
          semanticColor: "warning",
          icon: <PendingActionsIcon fontSize="small" />
        },
        {
          key: "misAsignacionesProximas",
          title: "Mis proximas reuniones",
          description: "Reuniones futuras ya asignadas a tu perfil.",
          semanticColor: "info",
          icon: <ScheduleIcon fontSize="small" />
        },
        {
          key: "misHorasMes",
          title: "Horas del mes",
          description: `Virtual ${formatHours(misHorasVirtualesMes)} | Presencial ${formatHours(misHorasPresencialesMes)}.`,
          semanticColor: "success",
          icon: <ScheduleIcon fontSize="small" />,
          formatValue: formatHours
        },
        {
          key: "misHorasMesAnterior",
          title: "Horas del mes pasado",
          description: `Virtual ${formatHours(misHorasVirtualesMesAnterior)} | Presencial ${formatHours(misHorasPresencialesMesAnterior)}.`,
          semanticColor: "info",
          icon: <EventNoteIcon fontSize="small" />,
          formatValue: formatHours
        }
      ],
      status: deriveAssistantStatus(summary),
      priorityItems: [
        `${agendaDisponible} evento(s) abiertos para tomar.`,
        `${misPostulaciones} postulacion(es) activas registradas.`,
        `${misAsignacionesProximas} reunion(es) futura(s) asignadas a tu perfil.`,
        `Mes actual: ${formatHours(misHorasVirtualesMes)} virtuales y ${formatHours(misHorasPresencialesMes)} presenciales.`,
        `Mes pasado: ${formatHours(misHorasVirtualesMesAnterior)} virtuales y ${formatHours(misHorasPresencialesMesAnterior)} presenciales.`
      ]
    };
  }

  if (role === "CONTADURIA") {
    const reunionesCompletadasMes = metricValue(summary, "reunionesCompletadasMes");
    const horasCompletadasMes = metricValue(summary, "horasCompletadasMes");
    const personasActivasMes = metricValue(summary, "personasActivasMes");

    return {
      title: "Seguimiento contable",
      subtitle: "Vista enfocada en ejecucion del periodo y volumen a revisar para liquidacion.",
      headerIcon: <PaymentsIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(126,77,13,0.10) 0%, rgba(214,158,46,0.14) 100%)",
      metrics: [
        {
          key: "reunionesCompletadasMes",
          title: "Reuniones ejecutadas",
          description: "Eventos ejecutados en el mes actual.",
          semanticColor: "warning",
          icon: <EventNoteIcon fontSize="small" />
        },
        {
          key: "horasCompletadasMes",
          title: "Horas ejecutadas",
          description: "Horas de asistencia acumuladas en el mes.",
          semanticColor: "info",
          icon: <ScheduleIcon fontSize="small" />,
          formatValue: formatHours
        },
        {
          key: "personasActivasMes",
          title: "Personas con actividad",
          description: "Asistentes con reuniones ejecutadas en el mes.",
          semanticColor: "success",
          icon: <GroupIcon fontSize="small" />
        }
      ],
      status: deriveAccountingStatus(summary),
      priorityItems: [
        `${reunionesCompletadasMes} reunion(es) ejecutadas acumuladas en el mes.`,
        `${formatHours(horasCompletadasMes)} de asistencia para control.`,
        `${personasActivasMes} asistente(s) con actividad ejecutada.`
      ]
    };
  }

  const solicitudesActivas = metricValue(summary, "solicitudesActivas");
  const proximasReuniones = metricValue(summary, "proximasReuniones");
  const personasActivasMes = metricValue(summary, "personasActivasMes");

  return {
    title: "Panel de Gestión Administrativa",
    subtitle: "Vista priorizada de la operación crítica y el pulso del sistema.",
    headerIcon: <AssignmentTurnedInIcon fontSize="small" />,
    background: "linear-gradient(135deg, rgba(15,23,42,0.08) 0%, rgba(56,189,248,0.1) 100%)",
    metrics: [
      {
        key: "solicitudesActivas",
        title: "Solicitudes vigentes",
        description: "En curso o programadas para el futuro.",
        semanticColor: "success",
        icon: <PendingActionsIcon fontSize="small" />
      },
      {
        key: "proximasReuniones",
        title: "Agenda hoy y mañana",
        description: "Carga operativa inmediata del sistema.",
        semanticColor: "info",
        icon: <EventNoteIcon fontSize="small" />
      },
      {
        key: "personasActivasMes",
        title: "Asistentes activos",
        description: "Personal con actividad en el mes actual.",
        semanticColor: "info",
        icon: <Groups2Icon fontSize="small" />
      }
    ],
status: deriveAdminStatus(summary),
    priorityItems: []
  };
}

function useCountdown(targetDate: string | null) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate).getTime();

    const update = () => {
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("Iniciada");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0) parts.push(`${minutes}m`);
      if (seconds > 0 && days === 0) parts.push(`${seconds}s`);

      setTimeLeft(parts.join(" "));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

export function SpaTabDashboard({
  summary,
  isLoadingSummary = false,
  role,
  agendaLibre = [],
  onGoToCreateMeeting,
  onGoToAssignAssistants,
  onGoToAgendaAvailable,
  onGoToMyAssignedMeetings,
  onRefresh
}: SpaTabDashboardProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const toneColor = (color: "error" | "warning" | "success" | "info" | "primary" | "secondary") =>
    isDarkMode ? `${color}.light` : `${color}.dark`;
  const countdown = useCountdown(summary?.nextMeeting?.startTime ?? null);
  const isAccountingRole = role === "CONTADURIA";
  const isAssistantRole = role === "ASISTENTE_ZOOM";
  const isDocenteRole = role === "DOCENTE";
  const [assistantCards, setAssistantCards] = useState<Array<{
    person: PersonHoursPerson;
    meetings: PersonHoursMeeting[];
  }>>([]);
  const [isLoadingPersonHours, setIsLoadingPersonHours] = useState(false);
  const [personHoursError, setPersonHoursError] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(getPreviousMonthKey());
  const [availableReportMonths, setAvailableReportMonths] = useState<string[]>([]);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [downloadReportError, setDownloadReportError] = useState("");
  const [isUploadingReport, setIsUploadingReport] = useState(false);
  const [uploadReportError, setUploadReportError] = useState("");
  const [uploadReportSuccess, setUploadReportSuccess] = useState("");
  const [uploadReportLink, setUploadReportLink] = useState<string | null>(null);
  const [tarifasByModalidad, setTarifasByModalidad] = useState<Record<"VIRTUAL" | "HIBRIDA", Tarifa | null>>({
    VIRTUAL: null,
    HIBRIDA: null
  });
  const [assistantUpcomingMeetings, setAssistantUpcomingMeetings] = useState<PersonHoursMeeting[]>([]);
  const [allAssistantMeetings, setAllAssistantMeetings] = useState<PersonHoursMeeting[]>([]);
  const [isLoadingAssistantPanel, setIsLoadingAssistantPanel] = useState(false);
  const [assistantPanelError, setAssistantPanelError] = useState("");
  const [assistantNowMs, setAssistantNowMs] = useState(() => Date.now());
  const [copyLinkFeedback, setCopyLinkFeedback] = useState("");

  async function refreshAccountingData() {
    setIsLoadingPersonHours(true);
    setPersonHoursError("");
    try {
      const payload = await loadPersonHours();
      if (!payload) {
        setPersonHoursError("No se pudo cargar el detalle de horas por persona.");
        setAssistantCards([]);
        return;
      }

      const currentMonthKey = getCurrentMonthKey();
      const closedMonthsWithRecords = (payload.availableMonthKeys ?? [])
        .filter((monthKey) => monthKey && monthKey < currentMonthKey)
        .sort((left, right) => right.localeCompare(left));
      setAvailableReportMonths(closedMonthsWithRecords);

      const preferredMonthKey = getPreviousMonthKey();
      setSelectedMonthKey((currentValue) => {
        if (currentValue && closedMonthsWithRecords.includes(currentValue)) {
          return currentValue;
        }
        if (closedMonthsWithRecords.includes(preferredMonthKey)) {
          return preferredMonthKey;
        }
        return closedMonthsWithRecords[0] ?? preferredMonthKey;
      });

      const detailPayloads = await Promise.all(
        (payload.people ?? []).map(async (person) => {
          const detail = await loadPersonHours(person.userId);
          return {
            person,
            meetings: detail?.meetings ?? []
          };
        })
      );

      setAssistantCards(detailPayloads.sort((left, right) => left.person.nombre.localeCompare(right.person.nombre, "es")));
    } finally {
      setIsLoadingPersonHours(false);
    }
  }

  async function refreshTarifasForEstimate() {
    const rates = await loadTarifas();
    if (!rates) return;

    const next: Record<"VIRTUAL" | "HIBRIDA", Tarifa | null> = {
      VIRTUAL: null,
      HIBRIDA: null
    };

    for (const rate of rates) {
      if (rate.modalidadReunion === "VIRTUAL" || rate.modalidadReunion === "HIBRIDA") {
        if (!next[rate.modalidadReunion]) {
          next[rate.modalidadReunion] = rate;
        }
      }
    }

    setTarifasByModalidad(next);
  }

  useEffect(() => {
    if (!isAccountingRole) return;
    void refreshAccountingData();
    void refreshTarifasForEstimate();
  }, [isAccountingRole]);

  async function refreshAssistantPanelData() {
    if (!isAssistantRole) return;

    setIsLoadingAssistantPanel(true);
    setAssistantPanelError("");
    try {
      const payload = await loadPersonHours();
      if (!payload) {
        setAssistantUpcomingMeetings([]);
        setAssistantPanelError("No se pudo cargar el detalle de tus reuniones asignadas.");
        return;
      }

      const nowMs = Date.now();
      const nextMeetings = payload.meetings
        .filter((meeting) => isFutureAssignedMeeting(meeting, nowMs))
        .sort(compareMeetingByStartAsc);
      setAssistantUpcomingMeetings(nextMeetings);
      setAllAssistantMeetings(payload.meetings);
    } finally {
      setIsLoadingAssistantPanel(false);
    }
  }

  useEffect(() => {
    if (!isAssistantRole) return;
    void refreshAssistantPanelData();
  }, [isAssistantRole]);

  useEffect(() => {
    if (!isAssistantRole) return;
    setAssistantNowMs(Date.now());
    const timer = window.setInterval(() => {
      setAssistantNowMs(Date.now());
    }, 60000);
    return () => window.clearInterval(timer);
  }, [isAssistantRole]);

  const assistantAgendaOpen = useMemo(
    () =>
      [...agendaLibre]
        .sort((left, right) => new Date(left.inicioProgramadoAt).getTime() - new Date(right.inicioProgramadoAt).getTime()),
    [agendaLibre]
  );
  
  const assistantStats = useMemo(() => {
    const now = new Date(assistantNowMs);
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const stats = {
      prevMonthVirtual: 0,
      prevMonthHibrida: 0,
      currentMonthPastVirtual: 0,
      currentMonthPastHibrida: 0,
      currentMonthFutureVirtual: 0,
      currentMonthFutureHibrida: 0,
    };

    allAssistantMeetings.forEach(m => {
      const time = new Date(m.inicioAt).getTime();
      const monthKey = `${new Date(m.inicioAt).getFullYear()}-${String(new Date(m.inicioAt).getMonth() + 1).padStart(2, "0")}`;
      const isVirtual = m.modalidadReunion === "VIRTUAL";
      const isHibrida = m.modalidadReunion === "HIBRIDA";
      const hours = m.minutos / 60;

      if (monthKey === prevMonthKey) {
        if (isVirtual) stats.prevMonthVirtual += hours;
        if (isHibrida) stats.prevMonthHibrida += hours;
      } else if (monthKey === currentMonthKey) {
        if (time < assistantNowMs) {
          if (isVirtual) stats.currentMonthPastVirtual += hours;
          if (isHibrida) stats.currentMonthPastHibrida += hours;
        } else {
          if (isVirtual) stats.currentMonthFutureVirtual += hours;
          if (isHibrida) stats.currentMonthFutureHibrida += hours;
        }
      }
    });

    return stats;
  }, [allAssistantMeetings, assistantNowMs]);

  const assistantAgendaToAssignCount = assistantAgendaOpen.length;
  const assistantAgendaPreview = assistantAgendaOpen.slice(0, 3);
  const nextMeeting = assistantUpcomingMeetings[0] ?? null;
  const nextMeetingId = nextMeeting ? resolveMeetingId(nextMeeting) : null;
  const nextMeetingJoinUrl = nextMeeting ? resolveMeetingJoinUrl(nextMeeting) : null;
  const nextMeetingAccount = nextMeeting ? resolveMeetingAccount(nextMeeting) : null;
  const recurrenceCountByMeetingId = useMemo(() => {
    const map = new Map<string, number>();
    for (const meeting of assistantUpcomingMeetings) {
      const meetingId = resolveMeetingId(meeting);
      if (!meetingId) continue;
      map.set(meetingId, (map.get(meetingId) ?? 0) + 1);
    }
    return map;
  }, [assistantUpcomingMeetings]);
  const nextMeetingRecurrenceCount = nextMeetingId
    ? recurrenceCountByMeetingId.get(nextMeetingId) ?? 1
    : 1;
  const nextMeetingCountdown = nextMeeting
    ? formatTimeUntil(nextMeeting.inicioProgramadoAt, assistantNowMs)
    : "Sin proximas reuniones";

  async function copyNextMeetingLink() {
    if (!nextMeetingJoinUrl) return;

    const copied = await copyTextToClipboard(nextMeetingJoinUrl);
    setCopyLinkFeedback(copied ? "Link copiado" : "No se pudo copiar");
    window.setTimeout(() => setCopyLinkFeedback(""), 2200);
  }

  if (!summary) {
    return (
      <Box sx={{ p: 0 }}>
        <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 4, mb: 3 }} />
        <Box sx={{ 
          display: "grid", 
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" }, 
          gap: 2,
          mb: 4 
        }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 3 }} />
          ))}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 3 }}>
          <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 4 }} />
          <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 4 }} />
        </Box>
      </Box>
    );
  }

  if (isAccountingRole) {
    const virtualRate = Number(tarifasByModalidad.VIRTUAL?.valorHora ?? 0);
    const hibridaRate = Number(tarifasByModalidad.HIBRIDA?.valorHora ?? 0);
    const virtualCurrency = tarifasByModalidad.VIRTUAL?.moneda ?? "";
    const hibridaCurrency = tarifasByModalidad.HIBRIDA?.moneda ?? "";
    const mixedCurrency = Boolean(virtualCurrency && hibridaCurrency && virtualCurrency !== hibridaCurrency);
    const paymentCurrency = !mixedCurrency ? (virtualCurrency || hibridaCurrency || "") : "";
    const selectedMonthLabel =
      selectedMonthKey && availableReportMonths.includes(selectedMonthKey)
        ? formatMonthKey(selectedMonthKey)
        : "Sin datos";

    const cards = assistantCards.map(({ person, meetings }) => {
      const monthMeetings = meetings
        .filter((meeting) => meeting.isCompleted && (!selectedMonthKey || toMonthKey(meeting.inicioAt) === selectedMonthKey))
        .sort((left, right) => new Date(right.inicioAt).getTime() - new Date(left.inicioAt).getTime());

      const virtualMinutes = monthMeetings.reduce((acc, meeting) => (
        meeting.modalidadReunion === "VIRTUAL" ? acc + meeting.minutos : acc
      ), 0);
      const hibridaMinutes = monthMeetings.reduce((acc, meeting) => (
        meeting.modalidadReunion === "HIBRIDA" ? acc + meeting.minutos : acc
      ), 0);
      const totalMinutes = virtualMinutes + hibridaMinutes;
      const virtualHours = Math.round((virtualMinutes / 60) * 100) / 100;
      const hibridaHours = Math.round((hibridaMinutes / 60) * 100) / 100;
      const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      const estimatedPayment = virtualHours * virtualRate + hibridaHours * hibridaRate;

      return {
        person,
        monthMeetings,
        virtualHours,
        hibridaHours,
        totalHours,
        totalMinutes,
        estimatedPayment
      };
    });

    const totals = cards.reduce((acc, card) => ({
      virtualHours: acc.virtualHours + card.virtualHours,
      hibridaHours: acc.hibridaHours + card.hibridaHours,
      totalHours: acc.totalHours + card.totalHours,
      totalEstimated: acc.totalEstimated + card.estimatedPayment,
      assistantsWithActivity: acc.assistantsWithActivity + (card.totalMinutes > 0 ? 1 : 0)
    }), {
      virtualHours: 0,
      hibridaHours: 0,
      totalHours: 0,
      totalEstimated: 0,
      assistantsWithActivity: 0
    });

    return (
      <>
      <Stack spacing={2}>
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", md: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  Horas por asistente
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Contaduria: horas ejecutadas del mes, separadas entre virtual y presencial (hibrida).
                </Typography>
              </Box>
              <Chip
                size="small"
                color={totals.assistantsWithActivity > 0 ? "success" : "warning"}
                label={totals.assistantsWithActivity > 0 ? "Con actividad" : "Sin actividad"}
              />
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              sx={{ mb: 1.2 }}
            >
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                Resumen mensual por asistente
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  select
                  label="Mes cerrado"
                  value={availableReportMonths.includes(selectedMonthKey) ? selectedMonthKey : ""}
                  onChange={(event) => setSelectedMonthKey(String(event.target.value))}
                  sx={{ minWidth: { sm: 180 } }}
                  helperText={
                    availableReportMonths.length > 0
                      ? "Solo meses cerrados con registros."
                      : "No hay meses cerrados con registros disponibles."
                  }
                >
                  {availableReportMonths.map((monthKey) => (
                    <MenuItem key={monthKey} value={monthKey}>
                      {formatMonthKey(monthKey)}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="outlined"
                  disabled={isLoadingPersonHours}
                  onClick={() => {
                    void refreshAccountingData();
                  }}
                >
                  Actualizar
                </Button>
                <Button
                  variant="contained"
                  disabled={isDownloadingReport || !selectedMonthKey || availableReportMonths.length === 0}
                  onClick={async () => {
                    setDownloadReportError("");
                    setUploadReportError("");
                    setUploadReportSuccess("");
                    setUploadReportLink(null);
                    setIsDownloadingReport(true);
                    const targetMonthKey = selectedMonthKey || getPreviousMonthKey();
                    const result = await downloadMonthlyAccountingReport(targetMonthKey);
                    if (!result.success) {
                      setDownloadReportError(result.error ?? "No se pudo descargar el informe mensual.");
                    }
                    setIsDownloadingReport(false);
                  }}
                >
                  {isDownloadingReport ? "Generando..." : "Descargar informe mensual"}
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  disabled={isUploadingReport || !selectedMonthKey || availableReportMonths.length === 0}
                  onClick={async () => {
                    setDownloadReportError("");
                    setUploadReportError("");
                    setUploadReportSuccess("");
                    setUploadReportLink(null);
                    setIsUploadingReport(true);
                    const result = await uploadMonthlyAccountingReportToDrive({
                      monthKey: selectedMonthKey || getPreviousMonthKey()
                    });
                    if (!result.success) {
                      setUploadReportError(
                        result.error ?? "No se pudo subir el informe mensual a Google Drive."
                      );
                    } else {
                      setUploadReportSuccess(
                        `Informe ${result.fileName ?? ""} subido correctamente a Drive.`
                      );
                      setUploadReportLink(result.driveWebViewLink ?? null);
                    }
                    setIsUploadingReport(false);
                  }}
                >
                  {isUploadingReport ? "Subiendo..." : "Subir informe a Drive"}
                </Button>
              </Stack>
            </Stack>

            {personHoursError ? (
              <Alert severity="error" sx={{ mb: 1.2 }}>
                {personHoursError}
              </Alert>
            ) : null}
            {downloadReportError ? (
              <Alert severity="error" sx={{ mb: 1.2 }}>
                {downloadReportError}
              </Alert>
            ) : null}
            {uploadReportError ? (
              <Alert severity="error" sx={{ mb: 1.2 }}>
                {uploadReportError}
              </Alert>
            ) : null}
            {uploadReportSuccess ? (
              <Alert
                severity="success"
                sx={{ mb: 1.2 }}
                action={
                  uploadReportLink ? (
                    <Button
                      color="inherit"
                      size="small"
                      href={uploadReportLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir en Drive
                    </Button>
                  ) : undefined
                }
              >
                {uploadReportSuccess}
              </Alert>
            ) : null}

            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mb: 1.2 }}>
              <Chip variant="outlined" label={selectedMonthLabel} />
              <Chip variant="outlined" label={`${assistantCards.length} asistentes`} />
              <Chip variant="outlined" label={`${totals.assistantsWithActivity} con actividad`} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Tarifas actuales: Virtual {formatMoney(virtualRate, virtualCurrency)} | Hibrida {formatMoney(hibridaRate, hibridaCurrency)}
            </Typography>
          </CardContent>
        </Card>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))"
            },
            gap: 1.2
          }}
        >
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Horas virtuales
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatHours(Math.round(totals.virtualHours * 100) / 100)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Horas presenciales
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatHours(Math.round(totals.hibridaHours * 100) / 100)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Horas totales
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatHours(Math.round(totals.totalHours * 100) / 100)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Estimado total
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatMoney(Math.round(totals.totalEstimated * 100) / 100, paymentCurrency)}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {mixedCurrency ? (
          <Alert severity="warning">
            Las tarifas tienen monedas distintas entre virtual e hibrida. Revisa conversion antes de liquidar.
          </Alert>
        ) : null}

        <Stack spacing={1.2}>
          {cards.map((card) => (
            <Card key={card.person.userId} variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                  sx={{ mb: 1.2 }}
                >
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      {card.person.nombre}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {card.person.email}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    color={card.totalMinutes > 0 ? "success" : "warning"}
                    label={card.totalMinutes > 0 ? `${card.monthMeetings.length} reuniones` : "Sin actividad"}
                  />
                </Stack>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "repeat(2, minmax(0, 1fr))",
                      lg: "repeat(3, minmax(0, 1fr))"
                    },
                    gap: 1
                  }}
                >
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ p: 1.2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Virtual
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {formatHours(card.virtualHours)}
                      </Typography>
                    </CardContent>
                  </Card>
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ p: 1.2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Hibrida
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {formatHours(card.hibridaHours)}
                      </Typography>
                    </CardContent>
                  </Card>
                  <Card variant="outlined" sx={{ borderRadius: 2 }}>
                    <CardContent sx={{ p: 1.2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Total mes
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        {formatHours(card.totalHours)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Box>

                <Box
                  sx={{
                    mt: 1.2,
                    p: 1.2,
                    borderRadius: 1.8,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.04) : "grey.50"
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Estimado base del mes
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 900 }}>
                    {formatMoney(Math.round(card.estimatedPayment * 100) / 100, paymentCurrency)}
                  </Typography>
                </Box>

                <Box sx={{ mt: 1.2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.8 }}>
                    Reuniones asistidas del mes
                  </Typography>
                  {card.monthMeetings.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No hay reuniones cumplidas para este asistente en el mes seleccionado.
                    </Typography>
                  ) : (
                    <Stack spacing={0.8}>
                      {card.monthMeetings.map((meeting) => (
                        <Box
                          key={meeting.assignmentId}
                          sx={{
                            p: 1,
                            borderRadius: 1.5,
                            border: "1px solid",
                            borderColor: "divider",
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 2fr) repeat(3, minmax(120px, 1fr))" },
                            gap: 1
                          }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {meeting.titulo}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Programa: {meeting.programaNombre || "Sin programa"}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Fecha
                            </Typography>
                            <Typography variant="body2">
                              {new Date(meeting.inicioAt).toLocaleString("es-UY", {
                                dateStyle: "short",
                                timeStyle: "short"
                              })}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Modalidad
                            </Typography>
                            <Typography variant="body2">{meeting.modalidadReunion}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Tiempo liquidable
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {formatHours(Math.round((meeting.minutos / 60) * 100) / 100)}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Stack>
      <Backdrop
        open={isLoadingPersonHours}
        sx={(theme) => ({
          color: "#fff",
          zIndex: theme.zIndex.drawer + 200,
          backdropFilter: "blur(2px)",
          backgroundColor: "rgba(12, 28, 56, 0.38)"
        })}
      >
        <Stack spacing={1.2} alignItems="center">
          <CircularProgress color="inherit" />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Actualizando...
          </Typography>
        </Stack>
      </Backdrop>
      </>
    );
  }

  const config = buildRoleConfig(role, summary);
  return (
    <Stack spacing={2.2}>
      {!isAssistantRole && !isDocenteRole && (
        <Card variant="outlined" sx={{ borderRadius: 3, background: config.background, mb: 3 }}>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", md: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mb: 0.5 }}>
                  <Box sx={{ display: "grid", placeItems: "center", color: "text.secondary" }}>
                    {config.headerIcon}
                  </Box>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    {config.title}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {config.subtitle}
                </Typography>
              </Box>
              <Chip
                size="medium"
                color={config.status.color}
                label={config.status.label}
                icon={config.status.color === "success" ? <CheckCircleIcon /> : <WarningAmberIcon />}
                sx={{ fontWeight: 700, px: 0.8 }}
              />
            </Stack>
            <Alert severity={config.status.color} sx={{ mt: 1.5 }}>
              {config.status.message}
            </Alert>
            {role === "ADMINISTRADOR" ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.2 }}>
                <Button
                  variant="contained"
                  onClick={onGoToCreateMeeting}
                  disabled={!onGoToCreateMeeting}
                >
                  Crear reuniones
                </Button>
                <Button
                  variant="outlined"
                  onClick={onGoToAssignAssistants}
                  disabled={!onGoToAssignAssistants}
                >
                  Asignar asistentes
                </Button>
              </Stack>
            ) : null}
          </CardContent>
        </Card>
      )}

      {role === "ADMINISTRADOR" && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5, px: 0.5 }}>
            Atención Requerida
          </Typography>
          <Grid container spacing={2}>
            {summary.colisionesZoom7d && summary.colisionesZoom7d > 0 ? (
              <Grid size={{ xs: 12, md: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: "100%",
                    borderColor: "error.main",
                    bgcolor: isDarkMode ? alpha(theme.palette.error.main, 0.14) : alpha(theme.palette.error.main, 0.08),
                    borderRadius: 3,
                    borderLeft: "8px solid",
                    borderLeftColor: "error.main"
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 2, bgcolor: "error.main", color: "white" }}>
                        <WarningAmberIcon />
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: toneColor("error") }}>Conflictos Detectados</Typography>
                        <Typography variant="h3" sx={{ fontWeight: 900, color: "error.main" }}>{summary.colisionesZoom7d}</Typography>
                      </Box>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 1.5, color: toneColor("error"), fontWeight: 500 }}>
                      Colisiones de horario en Zoom detectadas para los próximos 7 días.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : null}

            {summary.eventosSinAsistencia7d && summary.eventosSinAsistencia7d > 0 ? (
              <Grid size={{ xs: 12, md: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: "100%",
                    borderColor: "warning.main",
                    bgcolor: isDarkMode ? alpha(theme.palette.warning.main, 0.14) : alpha(theme.palette.warning.main, 0.08),
                    borderRadius: 3,
                    borderLeft: "8px solid",
                    borderLeftColor: "warning.main"
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 2, bgcolor: "warning.main", color: "white" }}>
                        <Groups2Icon />
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: toneColor("warning") }}>Asistencia Pendiente</Typography>
                        <Typography variant="h3" sx={{ fontWeight: 900, color: "warning.main" }}>{summary.eventosSinAsistencia7d}</Typography>
                      </Box>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 1.5, color: toneColor("warning"), fontWeight: 500 }}>
                      Reuniones con asistencia requerida sin personal asignado (&lt; 7d).
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : null}

            {((summary.manualPendings || 0) + (summary.solicitudesNoResueltas || 0)) !== 1 && 
             ((summary.manualPendings || 0) + (summary.solicitudesNoResueltas || 0)) > 0 ? (
              <Grid size={{ xs: 12, md: 4 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: "100%",
                    borderColor: "info.main",
                    bgcolor: isDarkMode ? alpha(theme.palette.info.main, 0.14) : alpha(theme.palette.info.main, 0.08),
                    borderRadius: 3,
                    borderLeft: "8px solid",
                    borderLeftColor: "info.main"
                  }}
                >
                  <CardContent>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ p: 1, borderRadius: 2, bgcolor: "info.main", color: "white" }}>
                        <BuildCircleIcon />
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: toneColor("info") }}>Gestión Manual</Typography>
                        <Typography variant="h3" sx={{ fontWeight: 900, color: "info.main" }}>
                          {(summary.manualPendings || 0) + (summary.solicitudesNoResueltas || 0)}
                        </Typography>
                      </Box>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 1.5, color: toneColor("info"), fontWeight: 500 }}>
                      Solicitudes pendientes o no resueltas que requieren tu intervención.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ) : null}
          </Grid>
        </Box>
      )}

      {isDocenteRole ? (
        <Stack spacing={4} sx={{ mt: 2 }}>
          {/* Hero Section for Docente */}
          <Box
            sx={{
              p: 4,
              borderRadius: 5,
              background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
              color: "white",
              position: "relative",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(31, 75, 143, 0.25)"
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: -50,
                right: -50,
                width: 200,
                height: 200,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.1)",
                filter: "blur(40px)"
              }}
            />
            
            <Grid container spacing={3} alignItems="center">
              <Grid size={{ xs: 12, md: 8 }}>
                <Typography variant="h4" sx={{ fontWeight: 900, mb: 1, letterSpacing: "-1px" }}>
                  ¡Hola de nuevo!
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9, mb: 3, maxWidth: 500 }}>
                  Tienes todo listo para tus próximas sesiones. Aquí tienes un resumen rápido de tu actividad académica.
                </Typography>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    onClick={() => onGoToMyAssignedMeetings?.()}
                    sx={{ 
                      bgcolor: "white", 
                      color: "primary.main", 
                      fontWeight: 800,
                      px: 3,
                      borderRadius: 3,
                      "&:hover": { bgcolor: alpha("#fff", 0.9) }
                    }}
                  >
                    Ver mis reuniones
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => onGoToCreateMeeting?.()}
                    sx={{ 
                      borderColor: "white", 
                      color: "white", 
                      fontWeight: 800,
                      px: 3,
                      borderRadius: 3,
                      "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" }
                    }}
                  >
                    Nueva solicitud
                  </Button>
                </Stack>
              </Grid>
              {summary?.nextMeeting && (
                <Grid size={{ xs: 12, md: 4 }}>
                  <Paper
                    sx={{
                      p: 2.5,
                      borderRadius: 4,
                      bgcolor: "rgba(255,255,255,0.12)",
                      backdropFilter: "blur(10px)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "white"
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 800, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Tu próxima sesión
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, mt: 1, mb: 0.5, lineHeight: 1.2 }}>
                      {summary.nextMeeting.titulo}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <CalendarMonthIcon sx={{ fontSize: 16, opacity: 0.8 }} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatZoomDateTime(summary.nextMeeting.startTime)}
                      </Typography>
                    </Stack>
                    <Chip 
                      label={summary.nextMeeting.modalidad} 
                      size="small" 
                      sx={{ bgcolor: "white", color: "primary.main", fontWeight: 800, height: 24 }} 
                    />
                  </Paper>
                </Grid>
              )}
            </Grid>
          </Box>

          {/* Detailed Metrics Grid for Docente */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(4, 1fr)"
              },
              gap: 2.5
            }}
          >
            {config.metrics.map((metric) => {
              const value = summary ? metricValue(summary, metric.key) : 0;
              const formattedValue = metric.formatValue ? metric.formatValue(value) : String(value);
              const resolvedSemanticColor = metric.semanticColor || "primary";
              const metricColor = theme.palette[resolvedSemanticColor as "primary"]?.main || theme.palette.primary.main;
              
              return (
                <Card
                  key={metric.key}
                  variant="outlined"
                  sx={{
                    borderRadius: 4,
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    border: "1px solid",
                    borderColor: alpha(metricColor, 0.1),
                    "&:hover": {
                      transform: "translateY(-5px)",
                      boxShadow: `0 12px 24px ${alpha(metricColor, 0.12)}`,
                      borderColor: metricColor
                    }
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 3,
                          display: "grid",
                          placeItems: "center",
                          bgcolor: alpha(metricColor, 0.08),
                          color: metricColor
                        }}
                      >
                        {metric.icon}
                      </Box>
                    </Stack>
                    <Typography variant="h3" sx={{ fontWeight: 900, mb: 0.5, color: "text.primary", letterSpacing: "-1px" }}>
                      {formattedValue}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "text.primary", mb: 0.5 }}>
                      {metric.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, lineHeight: 1.3, display: "block" }}>
                      {metric.description}
                    </Typography>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {/* Warning: sessions without Zoom link */}
          {summary && (metricValue(summary, "proximasReuniones") - metricValue(summary, "reunionesConZoom")) > 0 && (
            <Alert 
              severity="warning" 
              variant="outlined"
              sx={{ borderRadius: 3 }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {metricValue(summary, "proximasReuniones") - metricValue(summary, "reunionesConZoom")} sesión(es) aún sin link de Zoom asignado.
              </Typography>
            </Alert>
          )}

          {/* Next Meeting Card for Docente - REDESIGNED */}
          {isLoadingSummary && !summary?.nextMeeting ? (
            <Card variant="outlined" sx={{ borderRadius: 4, mb: 4 }}>
              <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 4 }} />
            </Card>
          ) : summary?.nextMeeting && (
            <Card
              variant="outlined"
              sx={{
                borderRadius: 4,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
                mb: 4
              }}
            >
              <Box sx={{ p: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), borderBottom: "1px solid", borderColor: "divider" }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <ScheduleIcon color="primary" sx={{ fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "primary.main", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Próxima sesión
                    </Typography>
                    {summary.nextMeeting.totalInstances && summary.nextMeeting.totalInstances > 1 && (
                      <Chip 
                        label={`Instancia ${summary.nextMeeting.instanceIndex} de ${summary.nextMeeting.totalInstances}`}
                        size="small"
                        sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700, bgcolor: "primary.main", color: "white" }}
                      />
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TimerIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                      Faltan: {countdown}
                    </Typography>
                  </Stack>
                </Stack>
              </Box>

              <CardContent sx={{ p: 3 }}>
                <Grid container spacing={3}>
                  {/* Title & Program Area */}
                  <Grid size={{ xs: 12, md: 5 }}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="h5" sx={{ fontWeight: 900, color: "text.primary", mb: 0.5, lineHeight: 1.2 }}>
                        {summary.nextMeeting.titulo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {summary.nextMeeting.programaNombre || "Sin programa asignado"}
                      </Typography>
                    </Box>

                    <Stack spacing={1.5}>
                      {/* DateTime row */}
                      <Stack direction="row" spacing={3}>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", mb: 0.5 }}>FECHA</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {new Date(summary.nextMeeting.startTime).toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", mb: 0.5 }}>INICIO</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {new Date(summary.nextMeeting.startTime).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })} hs
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", mb: 0.5 }}>FIN / DURACIÓN</Typography>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {new Date(summary.nextMeeting.endTime).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })} hs ({Math.round((new Date(summary.nextMeeting.endTime).getTime() - new Date(summary.nextMeeting.startTime).getTime()) / 60000)} min)
                          </Typography>
                        </Box>
                      </Stack>

                      {/* Host & Password Row */}
                      {summary.nextMeeting.hostAccount && (
                        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2, border: "1px dashed", borderColor: "divider" }}>
                          <Grid container spacing={2} alignItems="center">
                            <Grid size={{ xs: 6 }}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <AccountCircleIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                                <Box>
                                  <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", fontSize: "0.6rem" }}>CUENTA HOST</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem", wordBreak: "break-all" }}>{summary.nextMeeting.hostAccount}</Typography>
                                </Box>
                              </Stack>
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <LockIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                                <Box>
                                  <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", fontSize: "0.6rem" }}>CONTRASEÑA</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.8rem" }}>{summary.nextMeeting.hostPassword || "******"}</Typography>
                                </Box>
                              </Stack>
                            </Grid>
                          </Grid>
                        </Box>
                      )}
                    </Stack>
                  </Grid>

                  {/* Divider for desktop */}
                  <Grid size={{ xs: 12, md: 0.5 }} sx={{ display: { xs: "none", md: "flex" }, justifyContent: "center" }}>
                    <Divider orientation="vertical" flexItem />
                  </Grid>

                  {/* Zoom Link & Assistant Section */}
                  <Grid size={{ xs: 12, md: 6.5 }}>
                    <Stack spacing={3}>
                      {/* Zoom Link */}
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", mb: 1 }}>LINK DE ACCESO ZOOM</Typography>
                        {summary.nextMeeting.zoomJoinUrl ? (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box 
                              sx={{ 
                                p: 1, 
                                px: 2, 
                                bgcolor: alpha(theme.palette.primary.main, 0.05), 
                                borderRadius: 2, 
                                border: "1px solid", 
                                borderColor: alpha(theme.palette.primary.main, 0.2),
                                flex: 1,
                                overflow: "hidden"
                              }}
                            >
                              <Typography variant="body2" sx={{ color: "primary.main", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {summary.nextMeeting.zoomJoinUrl}
                              </Typography>
                            </Box>
                            <Button 
                              variant="outlined" 
                              size="small" 
                              onClick={() => {
                                navigator.clipboard.writeText(summary.nextMeeting?.zoomJoinUrl ?? "");
                                onRefresh?.();
                              }}
                              startIcon={<ContentCopyIcon />}
                              sx={{ borderRadius: 2, height: 40, minWidth: 100 }}
                            >
                              Copiar
                            </Button>
                            <Button 
                              variant="contained" 
                              size="small" 
                              href={summary.nextMeeting.zoomJoinUrl}
                              target="_blank"
                              sx={{ borderRadius: 2, height: 40, px: 3 }}
                            >
                              Entrar
                            </Button>
                          </Stack>
                        ) : (
                          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ borderRadius: 2, "& .MuiAlert-message": { fontWeight: 600 } }}>
                            Link de Zoom pendiente de asignación
                          </Alert>
                        )}
                      </Box>

                      {/* Assistant & Modalidad */}
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", mb: 1 }}>ASISTENTE ZOOM</Typography>
                          {summary.nextMeeting.asistente ? (
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <Avatar sx={{ width: 40, height: 40, bgcolor: "primary.main", fontWeight: 800, fontSize: "1rem" }}>
                                {summary.nextMeeting.asistente.nombre.charAt(0).toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 800 }}>{summary.nextMeeting.asistente.nombre}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{summary.nextMeeting.asistente.email}</Typography>
                              </Box>
                            </Stack>
                          ) : (
                            <Stack direction="row" spacing={1} alignItems="center">
                              {summary.nextMeeting.requiresAssistance ? (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "warning.main" }}>
                                  <WarningAmberIcon sx={{ fontSize: 20 }} />
                                  <Typography variant="body2" sx={{ fontWeight: 800 }}>Sin asistente asignado</Typography>
                                </Box>
                              ) : (
                                <Typography variant="body2" sx={{ fontWeight: 600, color: "text.secondary" }}>No requiere asistencia</Typography>
                              )}
                            </Stack>
                          )}
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                          <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", display: "block", mb: 1 }}>MODALIDAD Y ESTADO</Typography>
                          <Stack direction="row" spacing={1}>
                            <Chip 
                              label={summary.nextMeeting.modalidad} 
                              color={summary.nextMeeting.modalidad === "Virtual" ? "primary" : "secondary"} 
                              size="small" 
                              sx={{ fontWeight: 800, borderRadius: 1.5 }} 
                            />
                            {summary.nextMeeting.requiresAssistance && (
                              <Chip 
                                label="Con asistencia" 
                                variant="outlined" 
                                size="small" 
                                color="info"
                                icon={<SupportAgentIcon sx={{ fontSize: "14px !important" }} />}
                                sx={{ fontWeight: 800, borderRadius: 1.5 }} 
                              />
                            )}
                          </Stack>
                        </Grid>
                      </Grid>
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}
        </Stack>
      ) : role !== "ASISTENTE_ZOOM" && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 1.6
          }}
        >
          {config.metrics.map((metric) => {
            if (isLoadingSummary && !summary) {
              return (
                <Card
                  key={metric.key}
                  variant="outlined"
                  sx={{
                    borderRadius: 3,
                    p: 1.5,
                    background: theme.palette.background.paper
                  }}
                >
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1.5 }}>
                    <Skeleton variant="text" width="50%" height={24} />
                    <Skeleton variant="circular" width={34} height={34} />
                  </Stack>
                  <Skeleton variant="text" width="30%" height={48} />
                  <Skeleton variant="text" width="80%" height={20} />
                </Card>
              );
            }
            const value = summary ? metricValue(summary, metric.key) : 0;
            const formattedValue = metric.formatValue ? metric.formatValue(value) : String(value);
            const resolvedSemanticColor = resolveMetricSemanticColor(metric, value);
            const metricColor = SEMANTIC_METRIC_COLORS[resolvedSemanticColor];

            return (
              <Card
                key={metric.key}
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  position: "relative",
                  overflow: "hidden",
                  borderColor: `${metricColor}55`,
                  background: isDarkMode
                    ? `linear-gradient(180deg, ${metricColor}1f 0%, ${theme.palette.background.paper} 40%)`
                    : `linear-gradient(180deg, ${metricColor}14 0%, #ffffff 38%)`
                }}
              >
                <CardContent sx={{ p: 1.5 }}>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1.1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.25, pr: 1 }}>
                      {metric.title}
                    </Typography>
                    <Box
                      sx={{
                        minWidth: 34,
                        height: 34,
                        borderRadius: 1.4,
                        display: "grid",
                        placeItems: "center",
                        bgcolor: `${metricColor}22`,
                        color: metricColor,
                        border: "1px solid",
                        borderColor: `${metricColor}44`
                      }}
                    >
                      {metric.icon}
                    </Box>
                  </Stack>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: "-0.03em",
                      color: metricColor,
                      mb: 0.7
                    }}
                  >
                    {formattedValue}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                    {metric.description}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {role === "ASISTENTE_ZOOM" ? (
        <Stack spacing={3}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", lg: "repeat(5, 1fr)" },
              gap: 2
            }}
          >
            <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "warning.main", bgcolor: alpha(theme.palette.warning.main, isDarkMode ? 0.14 : 0.05) }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: toneColor("warning"), display: "flex", alignItems: "center", gap: 0.5 }}>
                  <PendingActionsIcon fontSize="small" /> Sin respuesta
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, color: "warning.main", mt: 1 }}>
                  {agendaLibre.filter(i => !i.intereses?.length || i.intereses[0].estadoInteres === "SIN_RESPUESTA").length}
                </Typography>
                <Typography variant="body2" sx={{ color: toneColor("warning"), mt: 0.5, lineHeight: 1.1, fontSize: "0.75rem" }}>
                  Esperando por tu acción.
                </Typography>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "success.main", bgcolor: alpha(theme.palette.success.main, isDarkMode ? 0.14 : 0.05) }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: toneColor("success"), display: "flex", alignItems: "center", gap: 0.5 }}>
                  <CheckCircleIcon fontSize="small" /> Ya respondidas
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, color: "success.main", mt: 1 }}>
                  {agendaLibre.filter(i => i.intereses?.length > 0 && i.intereses[0].estadoInteres !== "SIN_RESPUESTA").length}
                </Typography>
                <Typography variant="body2" sx={{ color: toneColor("success"), mt: 0.5, lineHeight: 1.1, fontSize: "0.75rem" }}>
                  Postulaciones o rechazos.
                </Typography>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "info.main", bgcolor: alpha(theme.palette.info.main, isDarkMode ? 0.14 : 0.08) }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: toneColor("info"), display: "flex", alignItems: "center", gap: 0.5 }}>
                  <ScheduleIcon fontSize="small" /> Próximas reuniones
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, color: "info.main", mt: 1 }}>
                  {assistantUpcomingMeetings.length}
                </Typography>
                <Typography variant="body2" sx={{ color: toneColor("info"), mt: 0.5, lineHeight: 1.2 }}>
                  Reuniones futuras en tu perfil.
                </Typography>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "primary.main", bgcolor: alpha(theme.palette.primary.main, isDarkMode ? 0.14 : 0.08) }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: toneColor("primary"), display: "flex", alignItems: "center", gap: 0.5 }}>
                  <EventNoteIcon fontSize="small" /> Mes Anterior
                </Typography>
                <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: "primary.main" }}>{formatHours(assistantStats.prevMonthVirtual)}</Typography>
                    <Typography variant="caption" sx={{ color: toneColor("primary"), fontWeight: 600 }}>Virtual</Typography>
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: "primary.main" }}>{formatHours(assistantStats.prevMonthHibrida)}</Typography>
                    <Typography variant="caption" sx={{ color: toneColor("primary"), fontWeight: 600 }}>Híbrida</Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: toneColor("primary"), mt: 0.5, fontWeight: 500, fontSize: "0.75rem" }}>
                  Total completadas: {formatHours(assistantStats.prevMonthVirtual + assistantStats.prevMonthHibrida)}
                </Typography>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 3, borderColor: "secondary.main", bgcolor: alpha(theme.palette.secondary.main, isDarkMode ? 0.14 : 0.08) }}>
              <CardContent sx={{ p: 2 }}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: toneColor("secondary"), display: "flex", alignItems: "center", gap: 0.5 }}>
                  <PendingActionsIcon fontSize="small" /> Este Mes (Proyectado)
                </Typography>
                <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: "secondary.main" }}>
                      {formatHours(assistantStats.currentMonthPastVirtual + assistantStats.currentMonthFutureVirtual)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: toneColor("secondary"), fontWeight: 600 }}>Virtual</Typography>
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: "secondary.main" }}>
                      {formatHours(assistantStats.currentMonthPastHibrida + assistantStats.currentMonthFutureHibrida)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: toneColor("secondary"), fontWeight: 600 }}>Híbrida</Typography>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ color: toneColor("secondary"), mt: 0.5, fontWeight: 500, fontSize: "0.7rem", lineHeight: 1.1 }}>
                  Cumplidas hasta hoy: {formatHours(assistantStats.currentMonthPastVirtual)} (V) / {formatHours(assistantStats.currentMonthPastHibrida)} (H)
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Card variant="outlined" sx={{ borderRadius: 3, borderLeft: "8px solid", borderLeftColor: "primary.main" }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 900 }}>
                  Tu Próxima Reunión
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" size="small" onClick={refreshAssistantPanelData} disabled={isLoadingAssistantPanel}>
                    {isLoadingAssistantPanel ? "Actualizando..." : "Actualizar panel"}
                  </Button>
                  <Button variant="contained" color="secondary" size="small" onClick={onGoToAgendaAvailable} disabled={!onGoToAgendaAvailable}>
                    Ver Disponibles
                  </Button>
                </Stack>
              </Stack>

              {assistantPanelError ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {assistantPanelError}
                </Alert>
              ) : null}

              {isLoadingAssistantPanel ? (
                <Stack spacing={2} sx={{ p: 1 }}>
                  <Skeleton variant="text" width="60%" height={40} />
                  <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 2 }} />
                </Stack>
              ) : nextMeeting ? (
                <Box>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between" sx={{ mb: 2 }}>
                    <Box>
                      <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        {nextMeeting.titulo || "Sin titulo"}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {nextMeeting.programaNombre || "Sin programa"}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      {nextMeetingJoinUrl && (
                        <Button variant="contained" color="primary" href={nextMeetingJoinUrl} target="_blank" rel="noreferrer">
                          Abrir Zoom
                        </Button>
                      )}
                      <Button variant="outlined" startIcon={<ContentCopyIcon fontSize="small" />} onClick={() => { void copyNextMeetingLink(); }} disabled={!nextMeetingJoinUrl}>
                        Copiar link
                      </Button>
                    </Stack>
                  </Stack>

                  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 2, bgcolor: isDarkMode ? alpha(theme.palette.common.white, 0.04) : "grey.50" }}>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Modalidad</Typography>
                        <Typography variant="body2" fontWeight={600}>{nextMeeting.modalidadReunion}</Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Duración</Typography>
                        <Typography variant="body2" fontWeight={600}>{Math.round(nextMeeting.minutosProgramados || nextMeeting.minutos)} minutos</Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Hora de Inicio</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatDateTime24(nextMeeting.inicioProgramadoAt)}</Typography>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Hora de Fin</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatDateTime24(nextMeeting.finProgramadoAt)}</Typography>
                      </Grid>
                      
                      <Grid size={{ xs: 12 }}><Divider sx={{ my: 0.5 }} /></Grid>
                      
                      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Meeting ID</Typography>
                        <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{nextMeetingId || "Pendiente"}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Tipo de Instancia</Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {nextMeetingRecurrenceCount > 1 ? "Serie recurrente" : "Instancia única"}
                        </Typography>
                      </Grid>

                      <Grid size={{ xs: 12 }}><Divider sx={{ my: 0.5 }} /></Grid>

                      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Cuenta Host</Typography>
                        <Typography variant="body2" fontWeight={600}>{nextMeetingAccount || "Pendiente"}</Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                        <ZoomAccountPasswordField hostAccount={nextMeetingAccount} label="Contraseña Host" />
                      </Grid>
                      
                      <Grid size={{ xs: 12 }}><Divider sx={{ my: 0.5 }} /></Grid>

                      <Grid size={{ xs: 12 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>Link de Zoom</Typography>
                        <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                          {nextMeetingJoinUrl || "No disponible"}
                        </Typography>
                        {copyLinkFeedback && (
                          <Typography variant="caption" color="success.main" fontWeight={700}>{copyLinkFeedback}</Typography>
                        )}
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
              ) : (
                <Alert severity="info">No tienes reuniones futuras asignadas. Revisa las reuniones disponibles para postular.</Alert>
              )}
            </CardContent>
          </Card>
        </Stack>
      ) : null}

    </Stack>
  );
}
