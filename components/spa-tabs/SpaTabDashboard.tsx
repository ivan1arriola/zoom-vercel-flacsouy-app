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
import type { DashboardSummary } from "@/src/services/dashboardApi";

interface SpaTabDashboardProps {
  summary: DashboardSummary | null;
}

type MetricCardItem = {
  key: keyof DashboardSummary;
  title: string;
  description: string;
  color: string;
  icon: ReactNode;
};

const metricCards: MetricCardItem[] = [
  {
    key: "solicitudesTotales",
    title: "Solicitudes Totales",
    description: "Volumen general del sistema.",
    color: "#2B6CB0",
    icon: <AssignmentTurnedInIcon fontSize="small" />
  },
  {
    key: "manualPendings",
    title: "Pendientes Manuales",
    description: "Requieren intervención administrativa.",
    color: "#B7791F",
    icon: <BuildCircleIcon fontSize="small" />
  },
  {
    key: "eventosSinSoporte",
    title: "Sin Soporte",
    description: "Eventos con asistencia aún no cubierta.",
    color: "#C53030",
    icon: <Groups2Icon fontSize="small" />
  },
  {
    key: "agendaAbierta",
    title: "Agenda Abierta",
    description: "Eventos disponibles para asistentes.",
    color: "#2F855A",
    icon: <EventAvailableIcon fontSize="small" />
  }
];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function deriveDashboardStatus(summary: DashboardSummary) {
  const riskScore =
    summary.manualPendings * 3 +
    summary.eventosSinSoporte * 4 +
    Math.max(0, summary.agendaAbierta - summary.eventosSinSoporte);

  if (summary.eventosSinSoporte >= 6 || summary.manualPendings >= 8 || riskScore >= 45) {
    return {
      label: "Critico",
      color: "error" as const,
      message: "Hay riesgo operativo alto. Priorizar cobertura y resolucion manual."
    };
  }

  if (summary.eventosSinSoporte > 0 || summary.manualPendings > 0 || riskScore >= 16) {
    return {
      label: "Atencion",
      color: "warning" as const,
      message: "Operacion estable pero con puntos a resolver en el corto plazo."
    };
  }

  return {
    label: "Estable",
    color: "success" as const,
    message: "No hay alertas activas relevantes en este momento."
  };
}

function buildPriorityItems(summary: DashboardSummary): string[] {
  const items: string[] = [];
  if (summary.eventosSinSoporte > 0) {
    items.push(`${summary.eventosSinSoporte} evento(s) sin soporte asignado.`);
  }
  if (summary.manualPendings > 0) {
    items.push(`${summary.manualPendings} solicitud(es) pendiente(s) de resolucion manual.`);
  }
  if (summary.agendaAbierta > 0) {
    items.push(`${summary.agendaAbierta} evento(s) con agenda de asistencia abierta.`);
  }
  if (items.length === 0) {
    items.push("No hay pendientes urgentes.");
  }
  return items;
}

export function SpaTabDashboard({ summary }: SpaTabDashboardProps) {
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

  const status = deriveDashboardStatus(summary);
  const totalOperational =
    summary.manualPendings + summary.eventosSinSoporte + summary.agendaAbierta;
  const priorityItems = buildPriorityItems(summary);

  return (
    <Stack spacing={2.2}>
      <Card
        variant="outlined"
        sx={{
          borderRadius: 3,
          background:
            "linear-gradient(135deg, rgba(31,75,143,0.08) 0%, rgba(249,181,3,0.12) 100%)"
        }}
      >
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Estado Operativo
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Resumen consolidado de la operación actual.
              </Typography>
            </Box>
            <Chip
              size="medium"
              color={status.color}
              label={status.label}
              icon={status.color === "success" ? <CheckCircleIcon /> : <WarningAmberIcon />}
              sx={{ fontWeight: 700, px: 0.8 }}
            />
          </Stack>
          <Alert severity={status.color} sx={{ mt: 1.5 }}>
            {status.message}
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
        {metricCards.map((metric) => {
          const value = summary[metric.key];
          const share = totalOperational > 0 ? (value / totalOperational) * 100 : 0;

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
            {priorityItems.map((item) => (
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
