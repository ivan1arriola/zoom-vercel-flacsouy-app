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
import {
  loadPersonHours,
  loadZoomAccountPassword,
  type PersonHoursMeeting
} from "@/src/services/tarifasApi";

interface SpaTabMisReunionesAsignadasProps {
  userId: string;
}

type MonthlyUpcomingGroup = {
  monthKey: string;
  meetings: PersonHoursMeeting[];
};

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getMonthKeyFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthKey(monthKey: string): string {
  const [yearRaw = "0", monthRaw = "1"] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return capitalizeFirst(
    date.toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" })
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-UY", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false
  });
}

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
    minute: "2-digit",
    hour12: false
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

function formatMinutesAsHHMM(totalMinutes: number): string {
  const normalizedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
    const segments = url.pathname.split("/").filter(Boolean);
    const roomTypeIndex = segments.findIndex((segment) => segment === "j" || segment === "w");
    if (roomTypeIndex < 0 || !segments[roomTypeIndex + 1]) return null;
    return normalizeZoomMeetingId(segments[roomTypeIndex + 1]);
  } catch {
    return null;
  }
}

function resolveMeetingId(meeting: PersonHoursMeeting): string | null {
  return normalizeZoomMeetingId(meeting.zoomMeetingId) ?? extractZoomMeetingIdFromJoinUrl(meeting.zoomJoinUrl);
}

function resolveJoinUrl(meeting: PersonHoursMeeting): string | null {
  const explicitJoinUrl = (meeting.zoomJoinUrl ?? "").trim();
  if (explicitJoinUrl) return explicitJoinUrl;
  const meetingId = resolveMeetingId(meeting);
  return meetingId ? `https://zoom.us/j/${meetingId}` : null;
}

function resolveHostAccountLabel(meeting: PersonHoursMeeting): string | null {
  const candidates = [meeting.zoomHostAccount, meeting.zoomAccountEmail, meeting.zoomAccountName];
  for (const candidate of candidates) {
    const normalized = (candidate ?? "").trim();
    if (normalized) return normalized;
  }
  return null;
}

function toUtcCalendarStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function buildMeetingCalendarDetails(meeting: PersonHoursMeeting): string {
  const meetingId = resolveMeetingId(meeting) ?? "-";
  const joinUrl = resolveJoinUrl(meeting);
  const hostAccount = resolveHostAccountLabel(meeting);
  const lines = [
    `Programa: ${meeting.programaNombre || "Sin programa"}`,
    `Modalidad: ${meeting.modalidadReunion === "VIRTUAL" ? "Virtual" : "Hibrida"}`,
    `Meeting ID: ${meetingId}`,
    hostAccount ? `Cuenta Zoom: ${hostAccount}` : null,
    joinUrl ? `Zoom: ${joinUrl}` : null
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

function buildGoogleCalendarUrl(meeting: PersonHoursMeeting): string {
  const text = meeting.titulo || "Reunion Zoom";
  const start = toUtcCalendarStamp(meeting.inicioProgramadoAt || meeting.inicioAt);
  const end = toUtcCalendarStamp(meeting.finProgramadoAt || meeting.finAt);
  const details = buildMeetingCalendarDetails(meeting);
  const location = resolveJoinUrl(meeting) || "Zoom";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates: `${start}/${end}`,
    details,
    location
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function slugifyForFileName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalized || "reunion";
}

function buildIcsContent(meeting: PersonHoursMeeting): string {
  const uid = `${meeting.assignmentId}-${meeting.eventId}@flacso-uruguay`;
  const dtStamp = toUtcCalendarStamp(new Date().toISOString());
  const dtStart = toUtcCalendarStamp(meeting.inicioProgramadoAt || meeting.inicioAt);
  const dtEnd = toUtcCalendarStamp(meeting.finProgramadoAt || meeting.finAt);
  const summary = escapeIcsText(meeting.titulo || "Reunion Zoom");
  const description = escapeIcsText(buildMeetingCalendarDetails(meeting));
  const location = escapeIcsText("Zoom");
  const joinUrl = resolveJoinUrl(meeting);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FLACSO Uruguay//Plataforma Zoom//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ];

  if (joinUrl) {
    lines.splice(lines.length - 2, 0, `URL:${escapeIcsText(joinUrl)}`);
  }

  return lines.join("\r\n");
}

function downloadMeetingIcs(meeting: PersonHoursMeeting): void {
  const content = buildIcsContent(meeting);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const fileName = `${slugifyForFileName(meeting.titulo || "reunion")}-${meeting.assignmentId}.ics`;

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function isFutureConfirmedMeeting(meeting: PersonHoursMeeting, nowMs: number): boolean {
  if (!["ASIGNADO", "ACEPTADO"].includes(meeting.estadoAsignacion)) return false;
  if (meeting.estadoEvento === "CANCELADO") return false;

  const endDate = new Date(meeting.finAt);
  const startDate = new Date(meeting.inicioAt);
  const endMs = Number.isNaN(endDate.getTime()) ? startDate.getTime() : endDate.getTime();
  if (!Number.isFinite(endMs)) return false;
  if (meeting.isCompleted) return false;

  return endMs >= nowMs;
}

function compareByStartAsc(left: PersonHoursMeeting, right: PersonHoursMeeting): number {
  return new Date(left.inicioAt).getTime() - new Date(right.inicioAt).getTime();
}

function getMeetingKey(meeting: PersonHoursMeeting): string {
  return `${meeting.assignmentId}:${meeting.eventId}:${meeting.inicioAt}`;
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

export function SpaTabMisReunionesAsignadas({ userId }: SpaTabMisReunionesAsignadasProps) {
  const [meetings, setMeetings] = useState<PersonHoursMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordByHostAccount, setPasswordByHostAccount] = useState<Record<string, string>>({});
  const [passwordLoadingByHostAccount, setPasswordLoadingByHostAccount] = useState<Record<string, boolean>>({});
  const [passwordErrorByHostAccount, setPasswordErrorByHostAccount] = useState<Record<string, string>>({});
  const [showPasswordByMeetingKey, setShowPasswordByMeetingKey] = useState<Record<string, boolean>>({});
  const [copyFeedbackByMeetingKey, setCopyFeedbackByMeetingKey] = useState<Record<string, string>>({});

  async function refresh() {
    if (!userId) return;
    setIsLoading(true);
    setError("");
    try {
      const payload = await loadPersonHours(userId);
      if (!payload) {
        setError("No se pudo cargar tus reuniones asignadas.");
        setMeetings([]);
        return;
      }
      setMeetings(payload.meetings);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [userId]);

  const monthlyGroups = useMemo<MonthlyUpcomingGroup[]>(() => {
    const nowMs = Date.now();
    const grouped = new Map<string, MonthlyUpcomingGroup>();

    for (const meeting of meetings) {
      if (!isFutureConfirmedMeeting(meeting, nowMs)) continue;

      const monthKey = getMonthKeyFromIso(meeting.inicioAt);
      if (!monthKey) continue;

      const existing = grouped.get(monthKey);
      if (existing) {
        existing.meetings.push(meeting);
        continue;
      }

      grouped.set(monthKey, {
        monthKey,
        meetings: [meeting]
      });
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
      .map((group) => ({
        ...group,
        meetings: [...group.meetings].sort(compareByStartAsc)
      }));
  }, [meetings]);

  const upcomingMeetings = useMemo(
    () => monthlyGroups.flatMap((group) => group.meetings),
    [monthlyGroups]
  );

  const currentMonthKey = getCurrentMonthKey();
  const pendingCurrentMonthMeetings = useMemo(
    () => upcomingMeetings.filter((meeting) => getMonthKeyFromIso(meeting.inicioAt) === currentMonthKey),
    [upcomingMeetings, currentMonthKey]
  );
  const totalFutureMeetings = upcomingMeetings.length;
  const totalMinutesVirtual = useMemo(
    () =>
      pendingCurrentMonthMeetings.reduce(
        (acc, meeting) => acc + (meeting.modalidadReunion === "VIRTUAL" ? meeting.minutos : 0),
        0
      ),
    [pendingCurrentMonthMeetings]
  );
  const totalMinutesHibrida = useMemo(
    () =>
      pendingCurrentMonthMeetings.reduce(
        (acc, meeting) => acc + (meeting.modalidadReunion === "HIBRIDA" ? meeting.minutos : 0),
        0
      ),
    [pendingCurrentMonthMeetings]
  );
  const isInitialLoading = isLoading && meetings.length === 0;

  async function handleTogglePassword(meeting: PersonHoursMeeting) {
    const meetingKey = getMeetingKey(meeting);
    const isVisible = Boolean(showPasswordByMeetingKey[meetingKey]);
    if (isVisible) {
      setShowPasswordByMeetingKey((prev) => ({
        ...prev,
        [meetingKey]: false
      }));
      return;
    }

    setShowPasswordByMeetingKey((prev) => ({
      ...prev,
      [meetingKey]: true
    }));

    const hostAccount = resolveHostAccountLabel(meeting);
    if (!hostAccount) {
      return;
    }

    if (passwordByHostAccount[hostAccount] || passwordLoadingByHostAccount[hostAccount]) {
      return;
    }

    setPasswordLoadingByHostAccount((prev) => ({
      ...prev,
      [hostAccount]: true
    }));
    setPasswordErrorByHostAccount((prev) => ({
      ...prev,
      [hostAccount]: ""
    }));

    try {
      const payload = await loadZoomAccountPassword(hostAccount);
      if (payload.success && payload.password) {
        setPasswordByHostAccount((prev) => ({
          ...prev,
          [hostAccount]: payload.password as string
        }));
        return;
      }

      setPasswordErrorByHostAccount((prev) => ({
        ...prev,
        [hostAccount]: payload.error ?? "No hay contrasena disponible para esta cuenta."
      }));
    } finally {
      setPasswordLoadingByHostAccount((prev) => ({
        ...prev,
        [hostAccount]: false
      }));
    }
  }

  async function handleCopyJoinLink(meeting: PersonHoursMeeting) {
    const meetingKey = getMeetingKey(meeting);
    const joinUrl = resolveJoinUrl(meeting);
    if (!joinUrl) return;

    const copied = await copyTextToClipboard(joinUrl);
    setCopyFeedbackByMeetingKey((prev) => ({
      ...prev,
      [meetingKey]: copied ? "Link copiado" : "No se pudo copiar"
    }));

    window.setTimeout(() => {
      setCopyFeedbackByMeetingKey((prev) => ({
        ...prev,
        [meetingKey]: ""
      }));
    }, 2200);
  }

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
              Mis reuniones asignadas
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Reuniones futuras ordenadas de la mas inminente a la mas lejana, separadas por mes.
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
              Cargando reuniones futuras...
            </Typography>
          </Box>
        ) : null}

        {isInitialLoading ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Skeleton variant="rounded" width={170} height={30} />
            <Skeleton variant="rounded" width={150} height={30} />
          </Stack>
        ) : (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            <Chip variant="outlined" label={`${monthlyGroups.length} mes(es)`} />
            <Chip
              variant="outlined"
              label={`${pendingCurrentMonthMeetings.length} reunion(es) pendiente(s) este mes`}
            />
            <Chip variant="outlined" label={`${totalFutureMeetings} reunion(es) futura(s)`} />
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
                  Virtual pendiente (mes actual)
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
                  Hibrida pendiente (mes actual)
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

        {!isInitialLoading && !isLoading && monthlyGroups.length === 0 ? (
          <Alert severity="info">
            No hay reuniones futuras confirmadas para tu perfil.
          </Alert>
        ) : null}

        <Stack spacing={1.2}>
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

                  {group.meetings.map((meeting) => {
                    const meetingKey = getMeetingKey(meeting);
                    const meetingId = resolveMeetingId(meeting);
                    const joinUrl = resolveJoinUrl(meeting);
                    const hostAccount = resolveHostAccountLabel(meeting);
                    const isPasswordVisible = Boolean(showPasswordByMeetingKey[meetingKey]);
                    const isPasswordLoading = Boolean(
                      hostAccount && passwordLoadingByHostAccount[hostAccount]
                    );
                    const resolvedPassword =
                      hostAccount ? (passwordByHostAccount[hostAccount] ?? null) : null;
                    const passwordError =
                      hostAccount ? (passwordErrorByHostAccount[hostAccount] ?? "") : "";
                    const copyFeedback = copyFeedbackByMeetingKey[meetingKey] ?? "";

                    return (
                      <Card key={meetingKey} variant="outlined" sx={{ borderRadius: 2 }}>
                        <CardContent sx={{ p: 1.5 }}>
                          <Stack
                            direction={{ xs: "column", md: "row" }}
                            spacing={1}
                            alignItems={{ xs: "flex-start", md: "center" }}
                            justifyContent="space-between"
                          >
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                {meeting.titulo || "Sin titulo"}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                {meeting.programaNombre || "Sin programa"}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                              <Chip
                                size="small"
                                color={meeting.modalidadReunion === "VIRTUAL" ? "success" : "info"}
                                variant="outlined"
                                label={meeting.modalidadReunion === "VIRTUAL" ? "Virtual" : "Hibrida"}
                              />
                              <Chip
                                size="small"
                                variant="outlined"
                                label={formatMinutesAsHHMM(meeting.minutosProgramados)}
                              />
                              {joinUrl ? (
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="secondary"
                                  href={joinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir
                                </Button>
                              ) : null}
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => void handleCopyJoinLink(meeting)}
                                disabled={!joinUrl}
                              >
                                Copiar link
                              </Button>
                              <Button
                                size="small"
                                variant={isPasswordVisible ? "contained" : "outlined"}
                                color="warning"
                                onClick={() => void handleTogglePassword(meeting)}
                                disabled={!hostAccount || isPasswordLoading}
                              >
                                {isPasswordLoading
                                  ? "Cargando clave..."
                                  : isPasswordVisible
                                    ? "Ocultar clave"
                                    : "Ver clave"}
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                href={buildGoogleCalendarUrl(meeting)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Google Calendar
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => downloadMeetingIcs(meeting)}
                              >
                                Descargar .ics
                              </Button>
                            </Stack>
                          </Stack>

                          <Box
                            sx={{
                              mt: 1,
                              display: "grid",
                              gridTemplateColumns: {
                                xs: "1fr",
                                md: "repeat(4, minmax(0, 1fr))"
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
                                {meetingId || "-"}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">Cuenta Zoom</Typography>
                              <Typography variant="body2">{hostAccount || "Sin cuenta asignada"}</Typography>
                            </Box>

                            <Box sx={{ gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                              <Typography variant="caption" color="text.secondary">Link de acceso</Typography>
                              <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                                {joinUrl ? (
                                  <a href={joinUrl} target="_blank" rel="noreferrer">
                                    {joinUrl}
                                  </a>
                                ) : (
                                  "Sin link de acceso"
                                )}
                              </Typography>
                              {copyFeedback ? (
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                                  {copyFeedback}
                                </Typography>
                              ) : null}
                            </Box>

                            {isPasswordVisible ? (
                              <Box sx={{ gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                                <Typography variant="caption" color="text.secondary">
                                  Contrasena de la cuenta Zoom
                                </Typography>
                                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                                  {resolvedPassword || passwordError || "No disponible"}
                                </Typography>
                              </Box>
                            ) : null}
                          </Box>

                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            Inicio exacto: {formatDateTime(meeting.inicioProgramadoAt)}
                          </Typography>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
