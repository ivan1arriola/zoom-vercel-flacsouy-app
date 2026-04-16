"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { loadAdminStats, type AdminStatsResponse } from "@/src/services/estadisticasApi";

function formatRatio(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function SpaTabEstadisticas() {
  const [data, setData] = useState<AdminStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setIsLoading(true);
    setError("");
    try {
      const response = await loadAdminStats();
      if (!response) {
        setError("No se pudieron cargar las estadisticas.");
        return;
      }
      setData(response);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const sortedAssistants = useMemo(() => {
    return [...(data?.assistants ?? [])].sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.asignadas !== a.asignadas) return b.asignadas - a.asignadas;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [data]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
            spacing={1}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Estadisticas de asistencia y notificaciones
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ratio asignadas/postuladas por asistente Zoom, junto con metricas de notificaciones.
              </Typography>
              {data?.generatedAt ? (
                <Typography variant="caption" color="text.secondary">
                  Actualizado: {new Date(data.generatedAt).toLocaleString("es-UY")}
                </Typography>
              ) : null}
            </Box>
            <Button variant="outlined" onClick={() => void refresh()} disabled={isLoading}>
              {isLoading ? "Actualizando..." : "Actualizar"}
            </Button>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
              gap: 1.2
            }}
          >
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">Notificaciones totales</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {data?.notifications.total ?? 0}
                </Typography>
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">Ultimos 7 dias</Typography>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                  {data?.notifications.last7Days ?? 0}
                </Typography>
              </CardContent>
            </Card>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="overline" color="text.secondary">Estado de envio</Typography>
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.8 }}>
                  <Chip size="small" label={`Enviadas: ${data?.notifications.byEstado.ENVIADA ?? 0}`} color="success" variant="outlined" />
                  <Chip size="small" label={`Pendientes: ${data?.notifications.byEstado.PENDIENTE ?? 0}`} color="warning" variant="outlined" />
                  <Chip size="small" label={`Fallidas: ${data?.notifications.byEstado.FALLIDA ?? 0}`} color="error" variant="outlined" />
                </Stack>
              </CardContent>
            </Card>
          </Box>

          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Distribucion por tipo de notificacion
              </Typography>
              <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                <Chip size="small" variant="outlined" label={`Email: ${data?.notifications.byTipo.EMAIL ?? 0}`} />
                <Chip size="small" variant="outlined" label={`In-App: ${data?.notifications.byTipo.IN_APP ?? 0}`} />
                <Chip size="small" variant="outlined" label={`Alerta operativa: ${data?.notifications.byTipo.ALERTA_OPERATIVA ?? 0}`} />
              </Stack>
            </CardContent>
          </Card>

          <Divider />

          {isLoading && !data ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Cargando estadisticas...</Typography>
            </Stack>
          ) : null}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Asistente</TableCell>
                  <TableCell>Postuladas</TableCell>
                  <TableCell>Asignadas</TableCell>
                  <TableCell>Ratio</TableCell>
                  <TableCell>Postuladas mes</TableCell>
                  <TableCell>Asignadas mes</TableCell>
                  <TableCell>Ratio mes</TableCell>
                  <TableCell>Notif. enviadas</TableCell>
                  <TableCell>Notif. fallidas</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedAssistants.map((row) => (
                  <TableRow key={row.asistenteZoomId} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.nombre}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.email}</Typography>
                    </TableCell>
                    <TableCell>{row.postuladas}</TableCell>
                    <TableCell>{row.asignadas}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={formatRatio(row.ratio)}
                        color={row.ratio >= 60 ? "success" : row.ratio >= 30 ? "warning" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{row.postuladasMesActual}</TableCell>
                    <TableCell>{row.asignadasMesActual}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={formatRatio(row.ratioMesActual)}
                        color={row.ratioMesActual >= 60 ? "success" : row.ratioMesActual >= 30 ? "warning" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{row.notificaciones.enviadas}</TableCell>
                    <TableCell>{row.notificaciones.fallidas}</TableCell>
                  </TableRow>
                ))}
                {sortedAssistants.length === 0 && !isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Alert severity="info">No hay asistentes con datos para mostrar.</Alert>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </CardContent>
    </Card>
  );
}
