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
  LinearProgress,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { loadPersonHours, type PersonHoursMeeting } from "@/src/services/tarifasApi";

interface SpaTabMisAsistenciasProps {
  userId: string;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-UY", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatMonthKey(monthKey: string): string {
  const [yearRaw = "0", monthRaw = "1"] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return date.toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getMonthKeyFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMinutesAsHHMM(totalMinutes: number): string {
  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function SpaTabMisAsistencias({ userId }: SpaTabMisAsistenciasProps) {
  const [meetings, setMeetings] = useState<PersonHoursMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("");

  async function refresh() {
    if (!userId) return;
    setIsLoading(true);
    setError("");
    try {
      const payload = await loadPersonHours(userId);
      if (!payload) {
        setError("No se pudo cargar tus reuniones asistidas.");
        setMeetings([]);
        return;
      }
      setMeetings(payload.meetings.filter((meeting) => meeting.isCompleted));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [userId]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const meeting of meetings) {
      const monthKey = getMonthKeyFromIso(meeting.inicioAt);
      if (monthKey) months.add(monthKey);
    }
    return Array.from(months.values()).sort((a, b) => b.localeCompare(a));
  }, [meetings]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      if (selectedMonthKey) setSelectedMonthKey("");
      return;
    }
    if (!selectedMonthKey || !monthOptions.includes(selectedMonthKey)) {
      setSelectedMonthKey(monthOptions[0]);
    }
  }, [monthOptions, selectedMonthKey]);

  const filteredMeetings = useMemo(() => {
    if (!selectedMonthKey) return meetings;
    return meetings.filter((meeting) => getMonthKeyFromIso(meeting.inicioAt) === selectedMonthKey);
  }, [meetings, selectedMonthKey]);

  const totalMinutesVirtual = useMemo(
    () =>
      filteredMeetings.reduce(
        (acc, meeting) => acc + (meeting.modalidadReunion === "VIRTUAL" ? meeting.minutos : 0),
        0
      ),
    [filteredMeetings]
  );
  const totalMinutesHibrida = useMemo(
    () =>
      filteredMeetings.reduce(
        (acc, meeting) => acc + (meeting.modalidadReunion === "HIBRIDA" ? meeting.minutos : 0),
        0
      ),
    [filteredMeetings]
  );
  const isInitialLoading = isLoading && meetings.length === 0;

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1.2 }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Mis reuniones asistidas
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Historial de reuniones pasadas agrupadas por mes.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { sm: 320 } }}>
            <TextField
              select
              size="small"
              label="Mes"
              value={selectedMonthKey}
              onChange={(event) => setSelectedMonthKey(String(event.target.value))}
              disabled={isLoading || monthOptions.length === 0}
            >
              {monthOptions.map((monthKey) => (
                <MenuItem key={monthKey} value={monthKey}>
                  {formatMonthKey(monthKey)}
                </MenuItem>
              ))}
            </TextField>
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Button variant="outlined" onClick={() => void refresh()} disabled={isLoading}>
                Actualizar
              </Button>
              {isLoading ? <CircularProgress size={18} /> : null}
            </Stack>
          </Stack>
        </Stack>

        {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}

        {isLoading ? (
          <Box sx={{ mb: 1.5 }}>
            <LinearProgress
              sx={{
                height: 8,
                borderRadius: 999,
                mb: 0.6
              }}
            />
            <Typography variant="caption" color="text.secondary">
              Cargando datos de tus asistencias...
            </Typography>
          </Box>
        ) : null}

        {isInitialLoading ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Skeleton variant="rounded" width={170} height={30} />
            <Skeleton variant="rounded" width={120} height={30} />
          </Stack>
        ) : (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Chip
              variant="outlined"
              label={selectedMonthKey ? formatMonthKey(selectedMonthKey) : "Sin mes seleccionado"}
            />
            <Chip variant="outlined" label={`${filteredMeetings.length} reunion(es)`} />
          </Stack>
        )}

        {isInitialLoading ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              gap: 1.2,
              mb: 1.5
            }}
          >
            <Skeleton variant="rounded" height={142} />
            <Skeleton variant="rounded" height={142} />
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
              gap: 1.2,
              mb: 1.5
            }}
          >
            <Card
              variant="outlined"
              sx={{
                borderRadius: 2.4,
                minHeight: { xs: 132, md: 142 },
                borderColor: "success.light",
                background: "linear-gradient(135deg, rgba(25,118,56,0.05) 0%, rgba(46,125,50,0.10) 100%)"
              }}
            >
              <CardContent sx={{ p: 1.8 }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Virtual del mes
                </Typography>
                <Typography variant="h2" sx={{ fontWeight: 800, lineHeight: 1.05, mt: 0.5 }}>
                  {formatMinutesAsHHMM(totalMinutesVirtual)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Formato HH:MM
                </Typography>
              </CardContent>
            </Card>
            <Card
              variant="outlined"
              sx={{
                borderRadius: 2.4,
                minHeight: { xs: 132, md: 142 },
                borderColor: "info.light",
                background: "linear-gradient(135deg, rgba(2,136,209,0.05) 0%, rgba(2,136,209,0.11) 100%)"
              }}
            >
              <CardContent sx={{ p: 1.8 }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Hibrida del mes
                </Typography>
                <Typography variant="h2" sx={{ fontWeight: 800, lineHeight: 1.05, mt: 0.5 }}>
                  {formatMinutesAsHHMM(totalMinutesHibrida)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Formato HH:MM
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}

        {!isInitialLoading && !isLoading && meetings.length === 0 ? (
          <Alert severity="info">Todavia no tienes reuniones pasadas asistidas.</Alert>
        ) : null}

        {!isInitialLoading && !isLoading && meetings.length > 0 && filteredMeetings.length === 0 ? (
          <Alert severity="info">No hay reuniones para el mes seleccionado.</Alert>
        ) : null}

        <Stack spacing={1}>
          {isInitialLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <Card key={`loading-${index}`} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1}
                      alignItems={{ xs: "flex-start", md: "center" }}
                      justifyContent="space-between"
                    >
                      <Box sx={{ width: "100%" }}>
                        <Skeleton variant="text" width="65%" height={34} />
                        <Skeleton variant="text" width="42%" height={24} />
                      </Box>
                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                        <Skeleton variant="rounded" width={90} height={28} />
                        <Skeleton variant="rounded" width={90} height={28} />
                        <Skeleton variant="rounded" width={70} height={28} />
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        mt: 1,
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          md: "repeat(3, minmax(0, 1fr))"
                        },
                        gap: 1
                      }}
                    >
                      <Box>
                        <Skeleton variant="text" width="35%" height={20} />
                        <Skeleton variant="text" width="70%" height={24} />
                      </Box>
                      <Box>
                        <Skeleton variant="text" width="25%" height={20} />
                        <Skeleton variant="text" width="70%" height={24} />
                      </Box>
                      <Box>
                        <Skeleton variant="text" width="35%" height={20} />
                        <Skeleton variant="text" width="55%" height={24} />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))
            : filteredMeetings.map((meeting) => (
                <Card key={meeting.assignmentId} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1}
                      alignItems={{ xs: "flex-start", md: "center" }}
                      justifyContent="space-between"
                    >
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {meeting.titulo}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {meeting.programaNombre || "Sin programa"}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                        <Chip size="small" variant="outlined" label={meeting.modalidadReunion} />
                        <Chip size="small" variant="outlined" label={`${meeting.minutos} min`} />
                        {meeting.zoomJoinUrl ? (
                          <Button
                            size="small"
                            variant="contained"
                            color="secondary"
                            href={meeting.zoomJoinUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        mt: 1,
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          md: "repeat(3, minmax(0, 1fr))"
                        },
                        gap: 1
                      }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary">Inicio</Typography>
                        <Typography variant="body2">{formatDateTime(meeting.inicioAt)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Fin</Typography>
                        <Typography variant="body2">{formatDateTime(meeting.finAt)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Meeting ID</Typography>
                        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                          {meeting.zoomMeetingId || "-"}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
