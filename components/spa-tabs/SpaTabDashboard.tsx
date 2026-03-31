import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  MenuItem,
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
import type { DashboardSummary } from "@/src/services/dashboardApi";
import {
  loadPersonHours,
  loadTarifas,
  type PersonHoursResponse,
  type Tarifa
} from "@/src/services/tarifasApi";

type DashboardRole = "ADMINISTRADOR" | "DOCENTE" | "ASISTENTE_ZOOM" | "CONTADURIA";
type DashboardMetricKey = Exclude<keyof DashboardSummary, "scope">;

interface SpaTabDashboardProps {
  summary: DashboardSummary | null;
  role: DashboardRole;
  onGoToCreateMeeting?: () => void;
  onGoToAssignAssistants?: () => void;
}

type MetricCardItem = {
  key: DashboardMetricKey;
  title: string;
  description: string;
  color: string;
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
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

function getMonthOptions(payload: PersonHoursResponse | null): string[] {
  if (!payload) return [];

  if (Array.isArray(payload.availableMonthKeys) && payload.availableMonthKeys.length > 0) {
    return [...payload.availableMonthKeys].sort((a, b) => b.localeCompare(a));
  }

  const monthSet = new Set<string>();
  for (const summary of payload.assistantSummaries ?? []) {
    for (const month of summary.months) {
      if (month.monthKey) monthSet.add(month.monthKey);
    }
  }

  return Array.from(monthSet.values()).sort((a, b) => b.localeCompare(a));
}

function toMonthKey(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function parseDecimalInput(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number, currency: string): string {
  const rounded = Math.round(value * 100) / 100;
  const amount = rounded.toFixed(2).replace(".", ",");
  return currency ? `${currency} ${amount}` : amount;
}

function deriveAdminStatus(summary: DashboardSummary): DashboardStatus {
  const manualPendings = metricValue(summary, "manualPendings");
  const eventosSinCobertura = metricValue(summary, "eventosSinCobertura");
  const agendaAbierta = metricValue(summary, "agendaAbierta");
  const riskScore = manualPendings * 3 + eventosSinCobertura * 4 + Math.max(0, agendaAbierta - eventosSinCobertura);

  if (eventosSinCobertura >= 6 || manualPendings >= 8 || riskScore >= 45) {
    return {
      label: "Critico",
      color: "error",
      message: "Hay riesgo operativo alto. Priorizar cobertura y resolucion manual."
    };
  }

  if (eventosSinCobertura > 0 || manualPendings > 0 || riskScore >= 16) {
    return {
      label: "Atencion",
      color: "warning",
      message: "Operacion estable, pero con puntos a resolver en el corto plazo."
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
          color: "#175FA1",
          icon: <AssignmentTurnedInIcon fontSize="small" />
        },
        {
          key: "solicitudesActivas",
          title: "Solicitudes activas",
          description: "Solicitudes aun en curso o vigentes.",
          color: "#2F855A",
          icon: <PendingActionsIcon fontSize="small" />
        },
        {
          key: "proximasReuniones",
          title: "Proximas reuniones",
          description: "Instancias futuras ya registradas.",
          color: "#C05621",
          icon: <EventNoteIcon fontSize="small" />
        },
        {
          key: "reunionesConZoom",
          title: "Con link Zoom",
          description: "Instancias futuras que ya tienen meeting ID asignado.",
          color: "#5A67D8",
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
      subtitle: "Solo ves agenda disponible, tus postulaciones y tus reuniones asignadas.",
      headerIcon: <SupportAgentIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(10,93,72,0.10) 0%, rgba(56,161,105,0.14) 100%)",
      metrics: [
        {
          key: "agendaDisponible",
          title: "Agenda disponible",
          description: "Eventos abiertos que todavia pueden tomarse.",
          color: "#2F855A",
          icon: <EventAvailableIcon fontSize="small" />
        },
        {
          key: "misPostulaciones",
          title: "Mis postulaciones",
          description: "Eventos donde marcaste interes.",
          color: "#D69E2E",
          icon: <PendingActionsIcon fontSize="small" />
        },
        {
          key: "misAsignacionesProximas",
          title: "Mis proximas reuniones",
          description: "Reuniones futuras ya asignadas a tu perfil.",
          color: "#2B6CB0",
          icon: <ScheduleIcon fontSize="small" />
        },
        {
          key: "misHorasMes",
          title: "Horas del mes",
          description: `Virtual ${formatHours(misHorasVirtualesMes)} | Presencial ${formatHours(misHorasPresencialesMes)}.`,
          color: "#2F855A",
          icon: <ScheduleIcon fontSize="small" />,
          formatValue: formatHours
        },
        {
          key: "misHorasMesAnterior",
          title: "Horas del mes pasado",
          description: `Virtual ${formatHours(misHorasVirtualesMesAnterior)} | Presencial ${formatHours(misHorasPresencialesMesAnterior)}.`,
          color: "#6B46C1",
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
          color: "#B7791F",
          icon: <EventNoteIcon fontSize="small" />
        },
        {
          key: "horasCompletadasMes",
          title: "Horas ejecutadas",
          description: "Horas de asistencia acumuladas en el mes.",
          color: "#2B6CB0",
          icon: <ScheduleIcon fontSize="small" />,
          formatValue: formatHours
        },
        {
          key: "personasActivasMes",
          title: "Personas con actividad",
          description: "Asistentes con reuniones ejecutadas en el mes.",
          color: "#2F855A",
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
  const eventosSinCobertura = metricValue(summary, "eventosSinCobertura");
  const agendaAbierta = metricValue(summary, "agendaAbierta");

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
        color: "#2B6CB0",
        icon: <AssignmentTurnedInIcon fontSize="small" />
      },
      {
        key: "manualPendings",
        title: "Pendientes manuales",
        description: "Casos que requieren intervencion administrativa.",
        color: "#B7791F",
        icon: <BuildCircleIcon fontSize="small" />
      },
      {
        key: "eventosSinCobertura",
        title: "Sin asistencia",
        description: "Eventos que todavia no tienen cobertura asignada.",
        color: "#C53030",
        icon: <Groups2Icon fontSize="small" />
      },
      {
        key: "agendaAbierta",
        title: "Agenda abierta",
        description: "Eventos visibles para el equipo de asistencia.",
        color: "#2F855A",
        icon: <EventAvailableIcon fontSize="small" />
      }
    ],
    status: deriveAdminStatus(summary),
    priorityItems: [
      `${solicitudesTotales} solicitud(es) totales registradas.`,
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
  onGoToCreateMeeting,
  onGoToAssignAssistants
}: SpaTabDashboardProps) {
  const isAccountingRole = role === "CONTADURIA";
  const [personHours, setPersonHours] = useState<PersonHoursResponse | null>(null);
  const [isLoadingPersonHours, setIsLoadingPersonHours] = useState(false);
  const [personHoursError, setPersonHoursError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [paymentAdjustment, setPaymentAdjustment] = useState("0");
  const [tarifasByModalidad, setTarifasByModalidad] = useState<Record<"VIRTUAL" | "HIBRIDA", Tarifa | null>>({
    VIRTUAL: null,
    HIBRIDA: null
  });

  async function refreshAccountingData(userId?: string) {
    setIsLoadingPersonHours(true);
    setPersonHoursError("");
    try {
      const payload = await loadPersonHours(userId);
      if (!payload) {
        setPersonHoursError("No se pudo cargar el detalle de horas por persona.");
        return;
      }

      setPersonHours(payload);
      const monthOptions = getMonthOptions(payload);

      setSelectedUserId((current) => {
        if (payload.selectedUserId) return payload.selectedUserId;
        if (current && payload.people.some((person) => person.userId === current)) return current;
        return payload.people[0]?.userId ?? "";
      });

      setSelectedMonthKey((current) => {
        if (monthOptions.length === 0) return "";
        if (current && monthOptions.includes(current)) return current;
        return monthOptions[0];
      });
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

  useEffect(() => {
    if (!isAccountingRole) return;
    if (!selectedUserId) return;
    if (personHours?.selectedUserId === selectedUserId) return;
    void refreshAccountingData(selectedUserId);
  }, [isAccountingRole, selectedUserId, personHours?.selectedUserId]);

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
    const rows = summary.contaduriaHorasPorAsistente ?? [];
    const horasVirtualesMes = Number(summary.horasVirtualesMes ?? 0);
    const horasPresencialesMes = Number(summary.horasPresencialesMes ?? 0);
    const horasTotalesMes = Number(summary.horasCompletadasMes ?? 0);
    const monthOptions = getMonthOptions(personHours);
    const selectedMonthLabel = selectedMonthKey ? formatMonthKey(selectedMonthKey) : "Sin datos";
    const selectedPerson = personHours?.people.find((person) => person.userId === selectedUserId) ?? null;
    const selectedMonthMeetings = (personHours?.meetings ?? [])
      .filter((meeting) => meeting.isCompleted && (!selectedMonthKey || toMonthKey(meeting.inicioAt) === selectedMonthKey))
      .sort((left, right) => new Date(right.inicioAt).getTime() - new Date(left.inicioAt).getTime());

    const selectedMonthVirtualMinutes = selectedMonthMeetings.reduce((acc, meeting) => (
      meeting.modalidadReunion === "VIRTUAL" ? acc + meeting.minutos : acc
    ), 0);
    const selectedMonthHibridaMinutes = selectedMonthMeetings.reduce((acc, meeting) => (
      meeting.modalidadReunion === "HIBRIDA" ? acc + meeting.minutos : acc
    ), 0);
    const selectedMonthTotalMinutes = selectedMonthVirtualMinutes + selectedMonthHibridaMinutes;

    const selectedMonthVirtualHours = Math.round((selectedMonthVirtualMinutes / 60) * 100) / 100;
    const selectedMonthHibridaHours = Math.round((selectedMonthHibridaMinutes / 60) * 100) / 100;
    const selectedMonthTotalHours = Math.round((selectedMonthTotalMinutes / 60) * 100) / 100;

    const virtualRate = Number(tarifasByModalidad.VIRTUAL?.valorHora ?? 0);
    const hibridaRate = Number(tarifasByModalidad.HIBRIDA?.valorHora ?? 0);
    const virtualCurrency = tarifasByModalidad.VIRTUAL?.moneda ?? "";
    const hibridaCurrency = tarifasByModalidad.HIBRIDA?.moneda ?? "";
    const mixedCurrency = Boolean(virtualCurrency && hibridaCurrency && virtualCurrency !== hibridaCurrency);
    const paymentCurrency = !mixedCurrency ? (virtualCurrency || hibridaCurrency || "") : "";

    const baseEstimatedPayment =
      selectedMonthVirtualHours * virtualRate +
      selectedMonthHibridaHours * hibridaRate;
    const manualAdjustment = parseDecimalInput(paymentAdjustment);
    const adjustedEstimatedPayment = baseEstimatedPayment + manualAdjustment;

    return (
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
                color={rows.length > 0 ? "success" : "warning"}
                label={rows.length > 0 ? "Con actividad" : "Sin actividad"}
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
                Horas cumplidas y estimado de pago
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  select
                  size="small"
                  label="Persona"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(String(event.target.value))}
                  disabled={isLoadingPersonHours || (personHours?.people.length ?? 0) === 0}
                  sx={{ minWidth: { sm: 260 } }}
                >
                  {(personHours?.people ?? []).map((person) => (
                    <MenuItem key={person.userId} value={person.userId}>
                      {person.nombre} ({person.email})
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Mes"
                  value={selectedMonthKey}
                  onChange={(event) => setSelectedMonthKey(String(event.target.value))}
                  disabled={isLoadingPersonHours || monthOptions.length === 0}
                  sx={{ minWidth: { sm: 180 } }}
                >
                  {monthOptions.length === 0 ? (
                    <MenuItem value="" disabled>
                      Sin actividad
                    </MenuItem>
                  ) : null}
                  {monthOptions.map((monthKey) => (
                    <MenuItem key={monthKey} value={monthKey}>
                      {formatMonthKey(monthKey)}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="outlined"
                  disabled={isLoadingPersonHours}
                  onClick={() => {
                    void refreshAccountingData(selectedUserId || undefined);
                  }}
                >
                  {isLoadingPersonHours ? "Actualizando..." : "Actualizar"}
                </Button>
              </Stack>
            </Stack>

            {personHoursError ? (
              <Alert severity="error" sx={{ mb: 1.2 }}>
                {personHoursError}
              </Alert>
            ) : null}

            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mb: 1.2 }}>
              <Chip variant="outlined" label={selectedMonthLabel} />
              <Chip variant="outlined" label={selectedPerson ? selectedPerson.nombre : "Sin persona"} />
              <Chip variant="outlined" label={`${selectedMonthMeetings.length} reuniones`} />
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  lg: "repeat(4, minmax(0, 1fr))"
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
                    {formatHours(selectedMonthVirtualHours)}
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Hibrida
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {formatHours(selectedMonthHibridaHours)}
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total mes
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>
                    {formatHours(selectedMonthTotalHours)}
                  </Typography>
                </CardContent>
              </Card>
              <Card variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 1.2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Tarifa base
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Virtual: {formatMoney(virtualRate, virtualCurrency)}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Hibrida: {formatMoney(hibridaRate, hibridaCurrency)}
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
                bgcolor: "grey.50",
                display: "grid",
                gap: 1,
                gridTemplateColumns: { xs: "1fr", md: "minmax(180px, 1fr) minmax(180px, 1fr) minmax(240px, 2fr)" }
              }}
            >
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Estimado base
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  {formatMoney(baseEstimatedPayment, paymentCurrency)}
                </Typography>
              </Box>
              <TextField
                size="small"
                label="Ajuste manual del mes"
                value={paymentAdjustment}
                onChange={(event) => setPaymentAdjustment(event.target.value)}
                helperText="No persiste. Solo referencia para calculo contable."
              />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Estimado ajustado
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>
                  {formatMoney(adjustedEstimatedPayment, paymentCurrency)}
                </Typography>
                {mixedCurrency ? (
                  <Typography variant="caption" color="warning.main">
                    Monedas distintas entre modalidades. Revisa conversion antes de liquidar.
                  </Typography>
                ) : null}
              </Box>
            </Box>

            <Box sx={{ mt: 1.2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.8 }}>
                Reuniones asistidas del mes
              </Typography>
              {selectedMonthMeetings.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay reuniones cumplidas para la persona y mes seleccionados.
                </Typography>
              ) : (
                <Stack spacing={0.8}>
                  {selectedMonthMeetings.map((meeting) => (
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
                {formatHours(horasVirtualesMes)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Horas presenciales
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatHours(horasPresencialesMes)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Horas totales
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {formatHours(horasTotalesMes)}
              </Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 3 }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Asistentes con horas
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 800 }}>
                {rows.length}
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
              Detalle por asistente
            </Typography>
            {rows.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Todavia no hay horas ejecutadas para este periodo.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {rows.map((row) => (
                  <Box
                    key={row.asistenteZoomId}
                    sx={{
                      p: 1.2,
                      borderRadius: 1.8,
                      border: "1px solid",
                      borderColor: "divider",
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", md: "minmax(220px, 2fr) repeat(3, minmax(110px, 1fr))" },
                      gap: 1
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {row.asistenteNombre}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.asistenteEmail || row.asistenteZoomId}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Virtual
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatHours(row.horasVirtuales)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Presencial
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatHours(row.horasPresenciales)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatHours(row.horasTotales)}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    );
  }

  const config = buildRoleConfig(role, summary);
  const totalMetrics = config.metrics.reduce((acc, metric) => acc + metricValue(summary, metric.key), 0);

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
          const share = totalMetrics > 0 ? (value / totalMetrics) * 100 : 0;

          return (
            <Card key={metric.key} variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.8 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {metric.title}
                  </Typography>
                  <Box
                    sx={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: `${metric.color}20`,
                      color: metric.color
                    }}
                  >
                    {metric.icon}
                  </Box>
                </Stack>
                <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  {metric.formatValue ? metric.formatValue(value) : value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.1 }}>
                  {metric.description}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={clampPercent(share)}
                  sx={{
                    height: 8,
                    borderRadius: 999,
                    bgcolor: "#edf2f7",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 999,
                      backgroundColor: metric.color
                    }
                  }}
                />
              </CardContent>
            </Card>
          );
        })}
      </Box>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.8 }}>
            Prioridades
          </Typography>
          <Stack spacing={0.75}>
            {config.priorityItems.map((item) => (
              <Box
                key={item}
                sx={{
                  px: 1.2,
                  py: 0.9,
                  borderRadius: 1.6,
                  bgcolor: "grey.50",
                  border: "1px solid",
                  borderColor: "divider"
                }}
              >
                <Typography variant="body2">{item}</Typography>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
