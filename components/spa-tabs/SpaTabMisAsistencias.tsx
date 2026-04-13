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
  LinearProgress,
  Skeleton,
  Stack,
  Typography
} from "@mui/material";
import { loadPersonHours, type PersonHoursMeeting } from "@/src/services/tarifasApi";

interface SpaTabMisAsistenciasProps {
  userId: string;
}

type MonthlyMeetingGroup = {
  monthKey: string;
  meetings: PersonHoursMeeting[];
};

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-UY", {
    dateStyle: "short"
  });
}

function formatTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("es-UY", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTimeRange(startValue: string, endValue: string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startValue} - ${endValue}`;
  }

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  if (sameDay) {
    return `${formatTimeOnly(startValue)} - ${formatTimeOnly(endValue)}`;
  }

  return `${formatDateOnly(startValue)} ${formatTimeOnly(startValue)} - ${formatDateOnly(endValue)} ${formatTimeOnly(endValue)}`;
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

function buildMonthKeyFromUtcDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getSettlementMonthKeys(): Set<string> {
  const now = new Date();
  const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  return new Set<string>([
    buildMonthKeyFromUtcDate(currentMonthDate),
    buildMonthKeyFromUtcDate(previousMonthDate)
  ]);
}

function formatMinutesAsHHMM(totalMinutes: number): string {
  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function compareByStartDesc(left: PersonHoursMeeting, right: PersonHoursMeeting): number {
  return new Date(right.inicioAt).getTime() - new Date(left.inicioAt).getTime();
}

function getMeetingKey(meeting: PersonHoursMeeting): string {
  return `${meeting.assignmentId}:${meeting.eventId}:${meeting.inicioAt}`;
}

export function SpaTabMisAsistencias({ userId }: SpaTabMisAsistenciasProps) {
  const [meetings, setMeetings] = useState<PersonHoursMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const settlementMonthKeys = useMemo(() => getSettlementMonthKeys(), []);

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

  const monthlyGroups = useMemo<MonthlyMeetingGroup[]>(() => {
    const grouped = new Map<string, PersonHoursMeeting[]>();
    for (const meeting of meetings) {
      const monthKey = getMonthKeyFromIso(meeting.inicioAt);
      if (!monthKey) continue;
      if (!settlementMonthKeys.has(monthKey)) continue;

      const monthMeetings = grouped.get(monthKey);
      if (monthMeetings) {
        monthMeetings.push(meeting);
      } else {
        grouped.set(monthKey, [meeting]);
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, monthMeetings]) => ({
        monthKey,
        meetings: [...monthMeetings].sort(compareByStartDesc)
      }));
  }, [meetings, settlementMonthKeys]);

  const meetingsOrdered = useMemo(
    () => monthlyGroups.flatMap((group) => group.meetings),
    [monthlyGroups]
  );

  const totalMinutesVirtual = useMemo(
    () =>
      meetingsOrdered.reduce(
        (acc, meeting) => acc + (meeting.modalidadReunion === "VIRTUAL" ? meeting.minutos : 0),
        0
      ),
    [meetingsOrdered]
  );
  const totalMinutesHibrida = useMemo(
    () =>
      meetingsOrdered.reduce(
        (acc, meeting) => acc + (meeting.modalidadReunion === "HIBRIDA" ? meeting.minutos : 0),
        0
      ),
    [meetingsOrdered]
  );
  const isInitialLoading = isLoading && meetings.length === 0;
  const hasNoSettlementMeetings = !isInitialLoading && !isLoading && meetings.length > 0 && monthlyGroups.length === 0;

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
              Solo se muestran el mes actual y el mes anterior (base para liquidacion).
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
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
            <Chip variant="outlined" label={`${monthlyGroups.length} mes(es)`} />
            <Chip variant="outlined" label={`${meetingsOrdered.length} reunion(es)`} />
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
                  Virtual total
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
                  Hibrida total
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
        {hasNoSettlementMeetings ? (
          <Alert severity="info">No tienes reuniones asistidas en el mes actual ni en el mes anterior.</Alert>
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
            : monthlyGroups.map((group) => (
                <Stack key={group.monthKey} spacing={1}>
                  <Divider textAlign="left">
                    <Chip size="small" variant="outlined" label={formatMonthKey(group.monthKey)} />
                  </Divider>
                  {group.meetings.map((meeting) => (
                    <Card key={getMeetingKey(meeting)} variant="outlined" sx={{ borderRadius: 2 }}>
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
                            <Chip size="small" variant="outlined" label={`Liquidable ${meeting.minutos} min`} />
                            <Chip size="small" variant="outlined" label={`Planificada ${meeting.minutosProgramados} min`} />
                            {meeting.minutosReales !== null ? (
                              <Chip size="small" variant="outlined" label={`Real ${meeting.minutosReales} min`} />
                            ) : null}
                            <Chip
                              size="small"
                              color={
                                meeting.huboGrabacion === true
                                  ? "warning"
                                  : meeting.huboGrabacion === false
                                    ? "default"
                                    : "info"
                              }
                              variant="outlined"
                              label={
                                meeting.huboGrabacion === true
                                  ? "Grabacion SI"
                                  : meeting.huboGrabacion === false
                                    ? "Grabacion NO"
                                    : "Grabacion s/confirmar"
                              }
                            />
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
                            <Typography variant="caption" color="text.secondary">Dia</Typography>
                            <Typography variant="body2">{formatDateOnly(meeting.inicioProgramadoAt)}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Horario</Typography>
                            <Typography variant="body2">
                              {formatTimeRange(meeting.inicioProgramadoAt, meeting.finProgramadoAt)}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Meeting ID</Typography>
                            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                              {meeting.zoomMeetingId || "-"}
                            </Typography>
                          </Box>
                          <Box sx={{ gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                            <Typography variant="caption" color="text.secondary">
                              Control interno (inicio/fin real)
                            </Typography>
                            <Typography variant="body2">
                              {meeting.inicioRealAt || meeting.finRealAt
                                ? `${meeting.inicioRealAt ? formatDateTime(meeting.inicioRealAt) : "-"} a ${meeting.finRealAt ? formatDateTime(meeting.finRealAt) : "-"}`
                                : "Sin datos reales registrados."}
                            </Typography>
                          </Box>
                        </Box>

                        {meeting.minutosReales !== null && meeting.minutosExtraNoLiquidados > 0 ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            Duracion real con {meeting.minutosExtraNoLiquidados} min extra. Ese excedente no se liquida automaticamente.
                            {meeting.requiereRevisionAdminPorExceso
                              ? " Se marca para revision administrativa (+60 min o mas)."
                              : ""}
                          </Typography>
                        ) : null}

                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.8 }}>
                          {meeting.huboGrabacion === true
                            ? "Hubo grabacion. Debe descargarse manualmente (fuera de la app)."
                            : meeting.huboGrabacion === false
                              ? "No hubo grabacion para esta reunion."
                              : meeting.requiereGrabacion
                                ? "Grabacion solicitada, sin confirmacion automatica en sistema."
                                : "Sin confirmacion de grabacion en sistema."}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
