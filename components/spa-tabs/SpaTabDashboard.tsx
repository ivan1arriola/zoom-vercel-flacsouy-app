import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography
} from "@mui/material";
import type { ReactNode } from "react";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import BuildCircleIcon from "@mui/icons-material/BuildCircle";
import Groups2Icon from "@mui/icons-material/Groups2";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SchoolIcon from "@mui/icons-material/School";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import PaymentsIcon from "@mui/icons-material/Payments";
import type { DashboardSummary } from "@/src/services/dashboardApi";

type DashboardRole = "ADMINISTRADOR" | "DOCENTE" | "ASISTENTE_ZOOM" | "CONTADURIA";

interface SpaTabDashboardProps {
  summary: DashboardSummary | null;
  role: DashboardRole;
}

type MetricCardItem = {
  key: keyof DashboardSummary;
  title: string;
  description: string;
  color: string;
  icon: ReactNode;
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

function deriveAdminStatus(summary: DashboardSummary): DashboardStatus {
  const riskScore =
    summary.manualPendings * 3 +
    summary.eventosSinSoporte * 4 +
    Math.max(0, summary.agendaAbierta - summary.eventosSinSoporte);

  if (summary.eventosSinSoporte >= 6 || summary.manualPendings >= 8 || riskScore >= 45) {
    return {
      label: "Critico",
      color: "error",
      message: "Hay riesgo operativo alto. Priorizar cobertura y resolucion manual."
    };
  }

  if (summary.eventosSinSoporte > 0 || summary.manualPendings > 0 || riskScore >= 16) {
    return {
      label: "Atencion",
      color: "warning",
      message: "Operacion estable pero con puntos a resolver en el corto plazo."
    };
  }

  return {
    label: "Estable",
    color: "success",
    message: "No hay alertas activas relevantes en este momento."
  };
}

function deriveAssistantStatus(summary: DashboardSummary): DashboardStatus {
  const riskScore = summary.eventosSinSoporte * 5 + summary.agendaAbierta * 2 + summary.manualPendings;

  if (summary.eventosSinSoporte >= 4 || riskScore >= 30) {
    return {
      label: "Alta demanda",
      color: "error",
      message: "Hay cobertura pendiente. Revisar agenda abierta y asignaciones urgentes."
    };
  }

  if (summary.eventosSinSoporte > 0 || summary.agendaAbierta > 0 || riskScore >= 10) {
    return {
      label: "En curso",
      color: "warning",
      message: "Hay reuniones disponibles o pendientes de cobertura para coordinar."
    };
  }

  return {
    label: "Sin alertas",
    color: "success",
    message: "No hay reuniones abiertas sin cubrir en este momento."
  };
}

function deriveAccountingStatus(summary: DashboardSummary): DashboardStatus {
  const riskScore = summary.manualPendings * 4 + summary.eventosSinSoporte * 2;

  if (summary.manualPendings >= 5 || riskScore >= 24) {
    return {
      label: "Riesgo de cierre",
      color: "error",
      message: "Pendientes manuales altos. Puede impactar liquidaciones y control mensual."
    };
  }

  if (summary.manualPendings > 0 || summary.eventosSinSoporte > 0) {
    return {
      label: "Seguimiento",
      color: "warning",
      message: "Hay pendientes operativos que conviene monitorear para cierre."
    };
  }

  return {
    label: "Controlado",
    color: "success",
    message: "No hay pendientes relevantes para el seguimiento contable."
  };
}

function deriveDocenteStatus(summary: DashboardSummary): DashboardStatus {
  if (summary.solicitudesTotales <= 0) {
    return {
      label: "Sin actividad",
      color: "warning",
      message: "Todavia no tenes solicitudes registradas."
    };
  }

  if (summary.solicitudesTotales >= 8) {
    return {
      label: "Alta actividad",
      color: "success",
      message: "Tenes varias solicitudes en curso y registradas en el sistema."
    };
  }

  return {
    label: "Activo",
    color: "success",
    message: "Tus solicitudes estan registradas correctamente."
  };
}

function buildRoleConfig(role: DashboardRole, summary: DashboardSummary): DashboardRoleConfig {
  if (role === "DOCENTE") {
    return {
      title: "Mi actividad",
      subtitle: "Resumen de tus solicitudes y contexto operativo.",
      headerIcon: <SchoolIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(23,95,161,0.10) 0%, rgba(56,132,255,0.12) 100%)",
      metrics: [
        {
          key: "solicitudesTotales",
          title: "Mis solicitudes",
          description: "Solicitudes creadas por tu perfil.",
          color: "#175FA1",
          icon: <AssignmentTurnedInIcon fontSize="small" />
        },
        {
          key: "agendaAbierta",
          title: "Agenda de asistencia",
          description: "Eventos con agenda de asistencia abierta (referencia global).",
          color: "#2F855A",
          icon: <EventAvailableIcon fontSize="small" />
        }
      ],
      status: deriveDocenteStatus(summary),
      priorityItems: summary.solicitudesTotales > 0
        ? [
            `${summary.solicitudesTotales} solicitud(es) registradas en tu perfil.`,
            "Si necesitas ajustes, gestiona los cambios desde la vista Solicitudes."
          ]
        : [
            "No hay solicitudes registradas en tu perfil.",
            "Crea una nueva solicitud para iniciar la gestion de tu reunion."
          ]
    };
  }

  if (role === "ASISTENTE_ZOOM") {
    return {
      title: "Panel de asistencia",
      subtitle: "Foco en cobertura, agenda y eventos a tomar.",
      headerIcon: <SupportAgentIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(10,93,72,0.10) 0%, rgba(56,161,105,0.14) 100%)",
      metrics: [
        {
          key: "agendaAbierta",
          title: "Agenda abierta",
          description: "Eventos disponibles para asistentes.",
          color: "#2F855A",
          icon: <EventAvailableIcon fontSize="small" />
        },
        {
          key: "eventosSinSoporte",
          title: "Sin cobertura",
          description: "Eventos que aun no tienen asistencia asignada.",
          color: "#C53030",
          icon: <Groups2Icon fontSize="small" />
        },
        {
          key: "manualPendings",
          title: "Pendientes manuales",
          description: "Casos que requieren intervencion administrativa.",
          color: "#B7791F",
          icon: <BuildCircleIcon fontSize="small" />
        }
      ],
      status: deriveAssistantStatus(summary),
      priorityItems: [
        `${summary.agendaAbierta} evento(s) en agenda abierta.`,
        `${summary.eventosSinSoporte} evento(s) sin asistencia asignada.`,
        `${summary.manualPendings} caso(s) manual(es) pendientes de resolucion.`
      ]
    };
  }

  if (role === "CONTADURIA") {
    return {
      title: "Control contable",
      subtitle: "Indicadores para seguimiento de cierre y liquidacion.",
      headerIcon: <PaymentsIcon fontSize="small" />,
      background: "linear-gradient(135deg, rgba(126,77,13,0.10) 0%, rgba(214,158,46,0.14) 100%)",
      metrics: [
        {
          key: "manualPendings",
          title: "Pendientes manuales",
          description: "Pueden impactar consistencia de datos para cierre.",
          color: "#B7791F",
          icon: <BuildCircleIcon fontSize="small" />
        },
        {
          key: "eventosSinSoporte",
          title: "Sin cobertura",
          description: "Eventos aun no cubiertos por asistencia.",
          color: "#C53030",
          icon: <Groups2Icon fontSize="small" />
        },
        {
          key: "solicitudesTotales",
          title: "Solicitudes",
          description: "Volumen total de solicitudes registradas.",
          color: "#2B6CB0",
          icon: <AssignmentTurnedInIcon fontSize="small" />
        },
        {
          key: "agendaAbierta",
          title: "Agenda abierta",
          description: "Eventos con cobertura todavia en proceso.",
          color: "#2F855A",
          icon: <EventAvailableIcon fontSize="small" />
        }
      ],
      status: deriveAccountingStatus(summary),
      priorityItems: [
        `${summary.manualPendings} caso(s) manual(es) pendientes para conciliacion.`,
        `${summary.eventosSinSoporte} evento(s) sin cobertura para seguimiento.`,
        "Revisar horas cumplidas por persona en la vista de tarifas/liquidacion mensual."
      ]
    };
  }

  return {
    title: "Estado operativo general",
    subtitle: "Resumen consolidado de la operacion actual.",
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
        description: "Requieren intervencion administrativa.",
        color: "#B7791F",
        icon: <BuildCircleIcon fontSize="small" />
      },
      {
        key: "eventosSinSoporte",
        title: "Sin asistencia",
        description: "Eventos con asistencia aun no cubierta.",
        color: "#C53030",
        icon: <Groups2Icon fontSize="small" />
      },
      {
        key: "agendaAbierta",
        title: "Agenda abierta",
        description: "Eventos disponibles para asistentes.",
        color: "#2F855A",
        icon: <EventAvailableIcon fontSize="small" />
      }
    ],
    status: deriveAdminStatus(summary),
    priorityItems: [
      summary.eventosSinSoporte > 0
        ? `${summary.eventosSinSoporte} evento(s) sin asistencia asignada.`
        : "No hay eventos sin asistencia asignada.",
      summary.manualPendings > 0
        ? `${summary.manualPendings} solicitud(es) pendiente(s) de resolucion manual.`
        : "No hay pendientes manuales.",
      summary.agendaAbierta > 0
        ? `${summary.agendaAbierta} evento(s) con agenda de asistencia abierta.`
        : "No hay agenda de asistencia abierta."
    ]
  };
}

export function SpaTabDashboard({ summary, role }: SpaTabDashboardProps) {
  if (!summary) {
    return (
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No hay datos de dashboard disponibles.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const config = buildRoleConfig(role, summary);
  const totalMetrics = config.metrics.reduce((acc, metric) => acc + summary[metric.key], 0);

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
          const value = summary[metric.key];
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
                  {value}
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
