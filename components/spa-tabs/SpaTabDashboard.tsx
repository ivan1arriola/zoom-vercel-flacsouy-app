import {
  Alert,
  Backdrop,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography
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
import PaymentsIcon from "@mui/icons-material/Payments";
import LinkIcon from "@mui/icons-material/Link";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import EventNoteIcon from "@mui/icons-material/EventNote";
import ScheduleIcon from "@mui/icons-material/Schedule";
import GroupIcon from "@mui/icons-material/Group";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type { DashboardSummary } from "@/src/services/dashboardApi";
import {
  downloadMonthlyAccountingReport,
  loadPersonHours,
  loadTarifas,
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
  const eventosSinCobertura = metricValue(summary, "eventosSinCobertura");
  const agendaAbierta = metricValue(summary, "agendaAbierta");
  const eventosCriticosSinLinkZoom = metricValue(summary, "eventosCriticosSinLinkZoom");
  const riesgosCriticosProximos =
    solicitudesNoResueltas + colisionesZoom7d + eventosSinAsistencia7d + eventosCriticosSinLinkZoom;

  if (colisionesZoom7d > 0 || eventosSinAsistencia7d > 0) {
    return {
      label: "Critico",
      color: "error",
      message:
        "Hay riesgo operativo en los proximos 7 dias: colisiones Zoom o reuniones con asistencia requerida sin asignar."
    };
  }

  if (solicitudesNoResueltas > 0) {
    return {
      label: "Atencion",
      color: "warning",
      message: "Existen solicitudes que no se pudieron resolver y requieren intervención administrativa."
    };
  }

  if (eventosSinCobertura > 0 || manualPendings > 0 || agendaAbierta > 0) {
    return {
      label: "Atencion",
      color: "warning",
      message: "Operacion estable, pero con puntos operativos a resolver."
    };
  }

  return {
    label: "Estable",
    color: "success",
    message: "No hay alertas operativas relevantes en este momento."
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
    const solicitudesTotales = metricValue(summary, "solicitudesTotales");
    const solicitudesActivas = metricValue(summary, "solicitudesActivas");
    const proximasReuniones = metricValue(summary, "proximasReuniones");
    const reunionesConZoom = metricValue(summary, "reunionesConZoom");

    return {
      title: "Mi actividad academica",
      subtitle: "Seguimiento de tus solicitudes y de las reuniones ya calendarizadas.",
      headerIcon: <SchoolIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(23,95,161,0.10) 0%, rgba(56,132,255,0.12) 100%)",
      metrics: [
        {
          key: "solicitudesTotales",
          title: "Solicitudes totales",
          description: "Solicitudes creadas desde tu perfil.",
          semanticColor: "info",
          icon: <AssignmentTurnedInIcon fontSize="small" />
        },
        {
          key: "solicitudesActivas",
          title: "Solicitudes activas",
          description: "Solicitudes aun en curso o vigentes.",
          semanticColor: "success",
          icon: <PendingActionsIcon fontSize="small" />
        },
        {
          key: "proximasReuniones",
          title: "Proximas reuniones",
          description: "Instancias futuras ya registradas.",
          semanticColor: "warning",
          icon: <EventNoteIcon fontSize="small" />
        },
        {
          key: "reunionesConZoom",
          title: "Con link Zoom",
          description: "Instancias futuras que ya tienen meeting ID asignado.",
          semanticColor: "info",
          icon: <LinkIcon fontSize="small" />
        }
      ],
      status: deriveDocenteStatus(summary),
      priorityItems: solicitudesTotales > 0
        ? [
            `${solicitudesActivas} solicitud(es) activa(s) para seguimiento.`,
            `${proximasReuniones} reunion(es) futura(s) registradas.`,
            `${reunionesConZoom} reunion(es) futura(s) con Zoom asignado.`
          ]
        : [
            "No hay solicitudes registradas en tu perfil.",
            "Crea una nueva solicitud para iniciar la gestion de tu reunion."
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

  const solicitudesTotales = metricValue(summary, "solicitudesTotales");
  const manualPendings = metricValue(summary, "manualPendings");
  const solicitudesNoResueltas = metricValue(summary, "solicitudesNoResueltas");
  const colisionesZoom7d = metricValue(summary, "colisionesZoom7d");
  const eventosSinAsistencia7d = metricValue(summary, "eventosSinAsistencia7d");
  const eventosSinCobertura = metricValue(summary, "eventosSinCobertura");
  const agendaAbierta = metricValue(summary, "agendaAbierta");
  const eventosCriticosSinLinkZoom = metricValue(summary, "eventosCriticosSinLinkZoom");

  return {
    title: "Estado operativo general",
    subtitle: "Resumen consolidado para administracion.",
    headerIcon: <AssignmentTurnedInIcon fontSize="small" />,
    background: "linear-gradient(135deg, rgba(31,75,143,0.08) 0%, rgba(249,181,3,0.12) 100%)",
    metrics: [
      {
        key: "solicitudesTotales",
        title: "Solicitudes totales",
        description: "Volumen general del sistema.",
        semanticColor: "info",
        icon: <AssignmentTurnedInIcon fontSize="small" />
      },
      {
        key: "manualPendings",
        title: "Pendientes manuales",
        description: "Casos que requieren intervencion administrativa.",
        semanticColor: "warning",
        icon: <BuildCircleIcon fontSize="small" />
      },
      {
        key: "solicitudesNoResueltas",
        title: "No resueltas",
        description: "Solicitudes que no pudieron provisionarse automáticamente.",
        semanticColor: "warning",
        icon: <WarningAmberIcon fontSize="small" />
      },
      {
        key: "colisionesZoom7d",
        title: "Colisiones Zoom (7d)",
        description: "Eventos superpuestos en la misma cuenta anfitriona.",
        semanticColor: "error",
        icon: <WarningAmberIcon fontSize="small" />
      },
      {
        key: "eventosSinAsistencia7d",
        title: "Sin asistencia (7d)",
        description: "Reuniones próximas con asistencia requerida sin personal asignado.",
        semanticColor: "error",
        icon: <Groups2Icon fontSize="small" />
      },
      {
        key: "eventosSinCobertura",
        title: "Sin asistencia",
        description: "Eventos que todavia no tienen cobertura asignada.",
        semanticColor: "error",
        icon: <Groups2Icon fontSize="small" />
      },
      {
        key: "agendaAbierta",
        title: "Agenda abierta",
        description: "Eventos visibles para el equipo de asistencia.",
        semanticColor: "success",
        icon: <EventAvailableIcon fontSize="small" />
      }
    ],
    status: deriveAdminStatus(summary),
    priorityItems: [
      `${solicitudesTotales} solicitud(es) totales registradas.`,
      eventosSinAsistencia7d > 0
        ? `${eventosSinAsistencia7d} reunion(es) en los proximos 7 dias con asistencia requerida y sin personal asignado.`
        : "Sin reuniones críticas por asistencia en los próximos 7 días.",
      colisionesZoom7d > 0
        ? `${colisionesZoom7d} evento(s) en colisión de horario en cuentas Zoom durante los próximos 7 días.`
        : "Sin colisiones de horario en cuentas Zoom para los próximos 7 días.",
      solicitudesNoResueltas > 0
        ? `${solicitudesNoResueltas} solicitud(es) que no se pudieron resolver automáticamente.`
        : "No hay solicitudes no resueltas.",
      eventosCriticosSinLinkZoom > 0
        ? `${eventosCriticosSinLinkZoom} evento(s) en 7 dias sin link Zoom generado.`
        : "Sin eventos críticos por link Zoom en los próximos 7 días.",
      eventosSinCobertura > 0
        ? `${eventosSinCobertura} evento(s) sin asistencia asignada.`
        : "No hay eventos sin asistencia asignada.",
      manualPendings > 0
        ? `${manualPendings} caso(s) pendiente(s) de resolucion manual.`
        : "No hay pendientes manuales.",
      agendaAbierta > 0
        ? `${agendaAbierta} evento(s) con agenda abierta para asistentes.`
        : "No hay agenda abierta en este momento."
    ]
  };
}

export function SpaTabDashboard({
  summary,
  role,
  agendaLibre = [],
  onGoToCreateMeeting,
  onGoToAssignAssistants,
  onGoToAgendaAvailable,
  onGoToMyAssignedMeetings
}: SpaTabDashboardProps) {
  const isAccountingRole = role === "CONTADURIA";
  const isAssistantRole = role === "ASISTENTE_ZOOM";
  const [assistantCards, setAssistantCards] = useState<Array<{
    person: PersonHoursPerson;
    meetings: PersonHoursMeeting[];
  }>>([]);
  const [isLoadingPersonHours, setIsLoadingPersonHours] = useState(false);
  const [personHoursError, setPersonHoursError] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState(getCurrentMonthKey());
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [downloadReportError, setDownloadReportError] = useState("");
  const [tarifasByModalidad, setTarifasByModalidad] = useState<Record<"VIRTUAL" | "HIBRIDA", Tarifa | null>>({
    VIRTUAL: null,
    HIBRIDA: null
  });
  const [assistantUpcomingMeetings, setAssistantUpcomingMeetings] = useState<PersonHoursMeeting[]>([]);
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
  const agendaToAssignCount = assistantAgendaOpen.length;
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
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No hay datos de inicio disponibles.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (isAccountingRole) {
    const virtualRate = Number(tarifasByModalidad.VIRTUAL?.valorHora ?? 0);
    const hibridaRate = Number(tarifasByModalidad.HIBRIDA?.valorHora ?? 0);
    const virtualCurrency = tarifasByModalidad.VIRTUAL?.moneda ?? "";
    const hibridaCurrency = tarifasByModalidad.HIBRIDA?.moneda ?? "";
    const mixedCurrency = Boolean(virtualCurrency && hibridaCurrency && virtualCurrency !== hibridaCurrency);
    const paymentCurrency = !mixedCurrency ? (virtualCurrency || hibridaCurrency || "") : "";
    const selectedMonthLabel = selectedMonthKey ? formatMonthKey(selectedMonthKey) : "Sin datos";

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
                  type="month"
                  label="Mes"
                  value={selectedMonthKey}
                  onChange={(event) => setSelectedMonthKey(String(event.target.value))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: { sm: 180 } }}
                />
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
                  disabled={isDownloadingReport || !selectedMonthKey}
                  onClick={async () => {
                    setDownloadReportError("");
                    setIsDownloadingReport(true);
                    const targetMonthKey = selectedMonthKey || getCurrentMonthKey();
                    const result = await downloadMonthlyAccountingReport(targetMonthKey);
                    if (!result.success) {
                      setDownloadReportError(result.error ?? "No se pudo descargar el informe mensual.");
                    }
                    setIsDownloadingReport(false);
                  }}
                >
                  {isDownloadingReport ? "Generando..." : "Descargar informe mensual"}
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
                    bgcolor: "grey.50"
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
      <Card variant="outlined" sx={{ borderRadius: 3, background: config.background }}>
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
          {role === "DOCENTE" ? (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
              sx={{ mt: 1.2 }}
            >
              <Button
                variant="contained"
                size="large"
                onClick={onGoToCreateMeeting}
                disabled={!onGoToCreateMeeting}
              >
                Crear sala Zoom ahora
              </Button>
              <Typography variant="caption" color="text.secondary">
                Esta es la accion principal del espacio docente.
              </Typography>
            </Stack>
          ) : null}
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

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 1.6
        }}
      >
        {config.metrics.map((metric) => {
          const value = metricValue(summary, metric.key);
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
                background: `linear-gradient(180deg, ${metricColor}14 0%, #ffffff 38%)`
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

      {role === "ASISTENTE_ZOOM" ? (
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
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
                  Operacion inmediata
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Lo proximo que tienes y lo disponible para tomar sin cambiar de pantalla.
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    void refreshAssistantPanelData();
                  }}
                  disabled={isLoadingAssistantPanel}
                >
                  {isLoadingAssistantPanel ? "Actualizando..." : "Actualizar panel"}
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={onGoToAgendaAvailable}
                  disabled={!onGoToAgendaAvailable}
                >
                  Reuniones disponibles
                </Button>
              </Stack>
            </Stack>

            {assistantPanelError ? (
              <Alert severity="error" sx={{ mb: 1.2 }}>
                {assistantPanelError}
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
                gap: 1.2,
                mb: 1.2
              }}
            >
              <Card variant="outlined" sx={{ borderRadius: 2.2 }}>
                <CardContent sx={{ p: 1.4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Reuniones para asignar
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    {agendaToAssignCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Instancias sin asistencia asignada en este momento.
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 2.2 }}>
                <CardContent sx={{ p: 1.4 }}>
                  <Typography variant="caption" color="text.secondary">
                    Proxima reunion
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>
                    {nextMeetingCountdown}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {nextMeeting ? formatDateTime24(nextMeeting.inicioProgramadoAt) : "Sin reuniones futuras asignadas."}
                  </Typography>
                </CardContent>
              </Card>
            </Box>

            {nextMeeting ? (
              <Box
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2.2,
                  p: 1.2,
                  mb: 1.2,
                  bgcolor: "grey.50"
                }}
              >
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      {nextMeeting.titulo || "Sin titulo"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {nextMeeting.programaNombre || "Sin programa"}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {nextMeetingJoinUrl ? (
                      <Button
                        size="small"
                        variant="contained"
                        color="secondary"
                        href={nextMeetingJoinUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir Zoom
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ContentCopyIcon fontSize="small" />}
                      onClick={() => {
                        void copyNextMeetingLink();
                      }}
                      disabled={!nextMeetingJoinUrl}
                    >
                      Copiar link
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={onGoToMyAssignedMeetings}
                      disabled={!onGoToMyAssignedMeetings}
                    >
                      Ver todas mis asignadas
                    </Button>
                  </Stack>
                </Stack>

                <Box
                  sx={{
                    mt: 1,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                    gap: 1
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Inicio
                    </Typography>
                    <Typography variant="body2">{formatDateTime24(nextMeeting.inicioProgramadoAt)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Meeting ID
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                      {nextMeetingId || "-"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Cuenta Zoom
                    </Typography>
                    <Typography variant="body2">{nextMeetingAccount || "-"}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Cantidad de reuniones
                    </Typography>
                    <Typography variant="body2">
                      {nextMeetingRecurrenceCount} {nextMeetingRecurrenceCount === 1 ? "instancia" : "instancias"}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Asistente por reunion
                    </Typography>
                    <MeetingAssistantStatusChip
                      requiresAssistance
                      assistantName="Tu asistencia"
                      pendingLabel="Pendiente"
                    />
                  </Box>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                    <Typography variant="caption" color="text.secondary">
                      Link de acceso
                    </Typography>
                    <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                      {nextMeetingJoinUrl || "Sin link de acceso"}
                    </Typography>
                    {copyLinkFeedback ? (
                      <Typography variant="caption" color="text.secondary">
                        {copyLinkFeedback}
                      </Typography>
                    ) : null}
                  </Box>
                  <Box sx={{ gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                    <ZoomAccountPasswordField
                      hostAccount={nextMeetingAccount}
                      label="Contrasena cuenta streaming"
                    />
                  </Box>
                </Box>
              </Box>
            ) : (
              <Alert severity="info" sx={{ mb: 1.2 }}>
                Aun no tienes reuniones futuras asignadas.
              </Alert>
            )}

            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.8 }}>
              Reuniones disponibles para tomar
            </Typography>
            {assistantAgendaPreview.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No hay reuniones sin asignar en este momento.
              </Typography>
            ) : (
              <Stack spacing={0.8}>
                {assistantAgendaPreview.map((event) => (
                  <Box
                    key={event.id}
                    sx={{
                      px: 1.1,
                      py: 0.9,
                      borderRadius: 1.6,
                      border: "1px solid",
                      borderColor: "divider",
                      bgcolor: "background.paper"
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {event.solicitud.titulo}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime24(event.inicioProgramadoAt)} | {event.solicitud.programaNombre || "Sin programa"} | {event.solicitud.modalidadReunion}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      ) : null}

    </Stack>
  );
}
