import { Box, Card, CardContent, Typography } from "@mui/material";
import type { DashboardSummary } from "@/src/services/dashboardApi";

interface SpaTabDashboardProps {
  summary: DashboardSummary | null;
}

const metricCards: Array<{
  key: keyof DashboardSummary;
  title: string;
  label: string;
}> = [
  { key: "solicitudesTotales", title: "Solicitudes", label: "Total" },
  { key: "manualPendings", title: "Pendientes manuales", label: "Casos" },
  { key: "eventosSinSoporte", title: "Cobertura soporte", label: "Sin asignar" },
  { key: "agendaAbierta", title: "Agenda abierta", label: "Eventos" }
];

export function SpaTabDashboard({ summary }: SpaTabDashboardProps) {
  if (!summary) return null;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 2
      }}
    >
      {metricCards.map((item) => (
        <Card key={item.key} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
              {item.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {item.label}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {summary[item.key]}
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
