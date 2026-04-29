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
  Skeleton,
  Stack,
  Typography,
  useTheme,
  alpha,
  Paper,
  Divider
} from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import ScheduleIcon from "@mui/icons-material/Schedule";
import AccessTimeFilledIcon from "@mui/icons-material/AccessTimeFilled";
import PaidIcon from "@mui/icons-material/Paid";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PendingActionsIcon from "@mui/icons-material/PendingActions";

import { loadPersonHours, type PersonHoursMeeting } from "@/src/services/tarifasApi";

interface SpaTabMisAsistenciasProps {
  userId: string;
}

function formatMinutesAsHHMM(totalMinutes: number): string {
  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getCurrentMonthLabel(): string {
  const now = new Date();
  const month = now.toLocaleDateString("es-UY", { month: "long" });
  return month.charAt(0).toUpperCase() + month.slice(1);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-UY", { 
    style: "currency", 
    currency: "UYU",
    minimumFractionDigits: 2 
  }).format(amount);
}

export function SpaTabMisAsistencias({ userId }: SpaTabMisAsistenciasProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const [meetings, setMeetings] = useState<PersonHoursMeeting[]>([]);
  const [rates, setRates] = useState<Record<string, { valorHora: number; moneda: string }>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const currentMonthLabel = useMemo(() => getCurrentMonthLabel(), []);

  async function refresh() {
    if (!userId) return;
    setIsLoading(true);
    setError("");
    try {
      const payload = await loadPersonHours(userId);

      if (!payload) {
        setError("No se pudo cargar tus reuniones.");
        return;
      }
      
      if (payload.rates) {
        setRates(payload.rates);
      }

      const now = new Date();
      const localYear = now.getFullYear();
      const localMonth = String(now.getMonth() + 1).padStart(2, "0");
      const currentMonthKey = `${localYear}-${localMonth}`;

      const currentMonthMeetings = payload.meetings
        .filter((m) => m.inicioAt.substring(0, 7) === currentMonthKey)
        .sort((a, b) => new Date(a.inicioAt).getTime() - new Date(b.inicioAt).getTime());
      
      setMeetings(currentMonthMeetings);
    } catch {
      setError("Error al cargar los datos.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [userId]);

  const stats = useMemo(() => {
    const virtualMins = meetings.reduce((acc, m) => acc + (m.modalidadReunion === "VIRTUAL" ? m.minutos : 0), 0);
    const hibridaMins = meetings.reduce((acc, m) => acc + (m.modalidadReunion === "HIBRIDA" ? m.minutos : 0), 0);
    
    const virtualRate = rates["VIRTUAL"]?.valorHora ?? 0;
    const hibridaRate = rates["HIBRIDA"]?.valorHora ?? 0;

    const virtualAmount = (virtualMins / 60) * virtualRate;
    const hibridaAmount = (hibridaMins / 60) * hibridaRate;

    return {
      virtualMins,
      hibridaMins,
      virtualAmount,
      hibridaAmount,
      totalAmount: virtualAmount + hibridaAmount
    };
  }, [meetings, rates]);

  const now = Date.now();

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
        <Box>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              mb: 1,
              background: isDarkMode
                ? `linear-gradient(45deg, ${theme.palette.success.light}, ${theme.palette.secondary.light})`
                : "linear-gradient(45deg, #2e7d32, #4caf50)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent"
            }}
          >
            Reuniones de {currentMonthLabel}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Control de horas y cotización proyectada para el mes en curso.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={() => void refresh()} disabled={isLoading} sx={{ borderRadius: 2, fontWeight: 700 }}>
          Actualizar
        </Button>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2, mb: 4 }}>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, bgcolor: alpha(theme.palette.success.main, isDarkMode ? 0.14 : 0.05), borderColor: alpha(theme.palette.success.main, isDarkMode ? 0.42 : 0.2) }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <AccessTimeFilledIcon color="success" sx={{ fontSize: 40 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="overline" sx={{ fontWeight: 800, color: isDarkMode ? "success.light" : "success.dark" }}>VIRTUALES</Typography>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>{formatMinutesAsHHMM(stats.virtualMins)}</Typography>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                <PaidIcon fontSize="small" color="success" />
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? "success.light" : "success.dark" }}>{formatCurrency(stats.virtualAmount)}</Typography>
              </Stack>
            </Box>
          </Stack>
        </Paper>
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, bgcolor: alpha(theme.palette.info.main, isDarkMode ? 0.14 : 0.05), borderColor: alpha(theme.palette.info.main, isDarkMode ? 0.42 : 0.2) }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <AccessTimeFilledIcon color="info" sx={{ fontSize: 40 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="overline" sx={{ fontWeight: 800, color: isDarkMode ? "info.light" : "info.dark" }}>HÍBRIDAS</Typography>
              <Typography variant="h4" sx={{ fontWeight: 900 }}>{formatMinutesAsHHMM(stats.hibridaMins)}</Typography>
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                <PaidIcon fontSize="small" color="info" />
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: isDarkMode ? "info.light" : "info.dark" }}>{formatCurrency(stats.hibridaAmount)}</Typography>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Box>

      <Paper sx={{ p: 2, mb: 4, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, isDarkMode ? 0.14 : 0.05), textAlign: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800, color: isDarkMode ? "primary.light" : "primary.dark" }}>
          Cotización Total Estimada: {formatCurrency(stats.totalAmount)}
        </Typography>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {isLoading && meetings.length === 0 ? (
        <Stack spacing={2}>
          {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 3 }} />)}
        </Stack>
      ) : meetings.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: "center", borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.03), border: "2px dashed", borderColor: alpha(theme.palette.primary.main, 0.1) }}>
          <Typography variant="h6" color="text.secondary" fontWeight={700}>
            No se encontraron reuniones para este mes.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {meetings.map((m) => {
            const meetingDate = new Date(m.inicioAt);
            const isCompleted = m.isCompleted || meetingDate.getTime() < now;
            const isPresencial = m.modalidadReunion === "HIBRIDA";
            return (
              <Card
                key={`${m.assignmentId}-${m.eventId}`}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  borderLeft: "4px solid",
                  borderLeftColor: isPresencial ? "error.main" : "primary.main",
                  bgcolor: isCompleted ? alpha(theme.palette.action.disabledBackground, 0.1) : "background.paper",
                  opacity: isCompleted ? (isDarkMode ? 0.92 : 0.8) : 1
                }}
              >
                <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
                  <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ minWidth: 50, textAlign: "center" }}>
                        <Typography variant="h6" sx={{ fontWeight: 900, lineHeight: 1 }}>{new Date(m.inicioAt).getDate()}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase" }}>{new Date(m.inicioAt).toLocaleDateString("es-UY", { month: "short" })}</Typography>
                      </Box>
                      <Divider orientation="vertical" flexItem />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, mb: 0.5 }} noWrap>{m.titulo}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" label={isPresencial ? "Presencial" : "Virtual"} color={isPresencial ? "error" : "primary"} sx={{ fontWeight: 800, height: 20, fontSize: "0.7rem" }} />
                          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", display: "flex", alignItems: "center", gap: 0.5 }}>
                            <ScheduleIcon sx={{ fontSize: 14 }} /> {new Date(m.inicioAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })} ({formatMinutesAsHHMM(m.minutos)})
                          </Typography>
                        </Stack>
                      </Box>
                    </Stack>

                    <Chip
                      size="small"
                      icon={isCompleted ? <CheckCircleIcon /> : <PendingActionsIcon />}
                      label={isCompleted ? "Completada" : "Pendiente"}
                      color={isCompleted ? "success" : "warning"}
                      variant="outlined"
                      sx={{ fontWeight: 700 }}
                    />
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
