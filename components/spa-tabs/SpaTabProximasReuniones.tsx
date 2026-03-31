"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import {
  loadZoomPastMeetingDetails,
  type ZoomPastMeetingDetails,
  type ZoomUpcomingMeeting
} from "@/src/services/zoomApi";
import {
  formatDurationHoursMinutes,
  formatZoomDateTime,
  getZoomAccountColor,
  buildZoomAccountColorMap
} from "@/components/spa-tabs/spa-tabs-utils";

type ZoomGroupingMode = "WEEK" | "MONTH";
type ZoomViewMode = "CALENDAR" | "RECURRENTES";

type ZoomMeetingGroup = {
  key: string;
  label: string;
  meetings: ZoomUpcomingMeeting[];
};

type ZoomRecurringSeries = {
  key: string;
  meetingId: string | null;
  topic: string;
  meetings: ZoomUpcomingMeeting[];
  accountEmails: string[];
};

type MonthOption = {
  value: string;
  label: string;
};

type RegisterUpcomingMeetingInput = {
  meeting: ZoomUpcomingMeeting;
  responsableNombre: string;
  programaNombre: string;
  modalidadReunion: "VIRTUAL" | "HIBRIDA";
  requiereAsistencia: boolean;
  descripcion?: string;
};

interface SpaTabProximasReunionesProps {
  title?: string;
  subtitle?: string;
  groupName: string;
  meetings: ZoomUpcomingMeeting[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePostMeetingRecord?: (meeting: ZoomUpcomingMeeting) => void;
  onRegisterUpcomingMeeting?: (input: RegisterUpcomingMeetingInput) => Promise<boolean>;
  isRegisteringUpcomingMeeting?: boolean;
  programaOptions?: string[];
  responsableOptions?: Array<{ value: string; label: string }>;
  defaultResponsableNombre?: string;
  enablePastMeetingDetails?: boolean;
  defaultDetailsExpanded?: boolean;
  defaultViewMode?: ZoomViewMode;
  onLoadMoreBack?: () => void;
  canLoadMoreBack?: boolean;
  isLoadingMoreBack?: boolean;
  monthOptions?: MonthOption[];
  selectedMonth?: string;
  onSelectMonth?: (monthKey: string) => void;
  isLoadingMonthSelection?: boolean;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

function formatGroupLabel(date: Date, mode: ZoomGroupingMode): string {
  if (mode === "MONTH") {
    return new Intl.DateTimeFormat("es-UY", {
      month: "long",
      year: "numeric"
    }).format(date);
  }

  const weekStart = startOfWeek(date);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const dayMonth = new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit"
  });
  const year = new Intl.DateTimeFormat("es-UY", { year: "numeric" }).format(weekStart);
  return `Semana ${dayMonth.format(weekStart)} - ${dayMonth.format(weekEnd)} (${year})`;
}

function formatGroupKey(date: Date, mode: ZoomGroupingMode): string {
  if (mode === "MONTH") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  const weekStart = startOfWeek(date);
  return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(
    weekStart.getDate()
  ).padStart(2, "0")}`;
}

function groupMeetingsByPeriod(
  meetings: ZoomUpcomingMeeting[],
  mode: ZoomGroupingMode
): ZoomMeetingGroup[] {
  const grouped = new Map<string, ZoomMeetingGroup>();

  for (const meeting of meetings) {
    const startDate = new Date(meeting.startTime);
    if (Number.isNaN(startDate.getTime())) continue;

    const key = formatGroupKey(startDate, mode);
    const existing = grouped.get(key);
    if (existing) {
      existing.meetings.push(meeting);
      continue;
    }

    grouped.set(key, {
      key,
      label: formatGroupLabel(startDate, mode),
      meetings: [meeting]
    });
  }

  return Array.from(grouped.values());
}

function buildRecurringSeries(
  meetings: ZoomUpcomingMeeting[],
  sortDescending: boolean
): ZoomRecurringSeries[] {
  const grouped = new Map<
    string,
    {
      meetingId: string | null;
      topic: string;
      meetings: ZoomUpcomingMeeting[];
      accountEmails: Set<string>;
    }
  >();

  for (const meeting of meetings) {
    if (meeting.meetingKind !== "RECURRENTE") continue;
    const topicKey = meeting.topic.trim().toLowerCase() || "sin-titulo";
    const accountKey = (meeting.accountEmail || meeting.accountId || "").trim().toLowerCase();
    const key = meeting.meetingId ? `meeting:${meeting.meetingId}` : `fallback:${accountKey}:${topicKey}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.meetings.push(meeting);
      if (meeting.accountEmail) existing.accountEmails.add(meeting.accountEmail);
      continue;
    }

    grouped.set(key, {
      meetingId: meeting.meetingId,
      topic: meeting.topic || "Sin titulo",
      meetings: [meeting],
      accountEmails: new Set(meeting.accountEmail ? [meeting.accountEmail] : [])
    });
  }

  const direction = sortDescending ? -1 : 1;
  const series = Array.from(grouped.entries()).map(([key, value]) => {
    const sortedMeetings = [...value.meetings].sort(
      (a, b) => direction * (new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    );
    return {
      key,
      meetingId: value.meetingId,
      topic: value.topic,
      meetings: sortedMeetings,
      accountEmails: Array.from(value.accountEmails)
    };
  });

  return series.sort((a, b) => {
    const aStart = new Date(a.meetings[0]?.startTime ?? "").getTime();
    const bStart = new Date(b.meetings[0]?.startTime ?? "").getTime();
    return direction * (aStart - bStart);
  });
}

function getMeetingCardKey(meeting: ZoomUpcomingMeeting): string {
  return `${meeting.accountId}:${meeting.id}:${meeting.startTime}`;
}

function formatNullableCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return String(Math.max(0, Math.floor(value)));
}

function renderAssociation(meeting: ZoomUpcomingMeeting) {
  if (!meeting.association.linked) {
    return <Chip size="small" color="warning" label="Pendiente de asociacion" />;
  }

  const programaNombre = meeting.association.solicitudProgramaNombre?.trim();

  return (
    <Stack spacing={0.35}>
      <Chip size="small" color="success" label="Asociada" />
      {meeting.association.solicitudId ? (
        <Typography variant="caption" color="text.secondary">
          Solicitud {meeting.association.solicitudId}
        </Typography>
      ) : null}
      {programaNombre ? (
        <Typography variant="caption" color="text.secondary">
          Programa: {programaNombre}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function SpaTabProximasReuniones({
  title = "Proximas reuniones (Zoom)",
  subtitle = "Reuniones listadas desde Zoom para el grupo seleccionado.",
  groupName,
  meetings,
  isLoading,
  onRefresh,
  onCreatePostMeetingRecord,
  onRegisterUpcomingMeeting,
  isRegisteringUpcomingMeeting = false,
  programaOptions = [],
  responsableOptions = [],
  defaultResponsableNombre = "",
  enablePastMeetingDetails = false,
  defaultDetailsExpanded = false,
  defaultViewMode = "CALENDAR",
  onLoadMoreBack,
  canLoadMoreBack = false,
  isLoadingMoreBack = false,
  monthOptions = [],
  selectedMonth = "",
  onSelectMonth,
  isLoadingMonthSelection = false
}: SpaTabProximasReunionesProps) {
  const [grouping, setGrouping] = useState<ZoomGroupingMode>("MONTH");
  const [viewMode, setViewMode] = useState<ZoomViewMode>(defaultViewMode);
  const [registerDialogMeeting, setRegisterDialogMeeting] = useState<ZoomUpcomingMeeting | null>(null);
  const [registerForm, setRegisterForm] = useState({
    responsableNombre: "",
    programaNombre: "",
    modalidadReunion: "VIRTUAL" as "VIRTUAL" | "HIBRIDA",
    requiereAsistencia: false,
    descripcion: ""
  });
  const [expandedDetailsByMeeting, setExpandedDetailsByMeeting] = useState<Record<string, boolean>>({});
  const [loadingDetailsByMeeting, setLoadingDetailsByMeeting] = useState<Record<string, boolean>>({});
  const [detailsByMeeting, setDetailsByMeeting] = useState<Record<string, ZoomPastMeetingDetails | null>>({});
  const [detailsErrorsByMeeting, setDetailsErrorsByMeeting] = useState<Record<string, string>>({});
  const canSubmitRegisterDialog = Boolean(
    registerDialogMeeting &&
      registerDialogMeeting.meetingId &&
      registerForm.responsableNombre.trim() &&
      registerForm.programaNombre.trim()
  );

  const groupedMeetings = useMemo(
    () => groupMeetingsByPeriod(meetings, grouping),
    [meetings, grouping]
  );
  const accountColorMap = useMemo(
    () =>
      buildZoomAccountColorMap(
        meetings.map((meeting) => `${meeting.accountId}:${meeting.accountEmail}`)
      ),
    [meetings]
  );
  const recurringSeries = useMemo(
    () => buildRecurringSeries(meetings, enablePastMeetingDetails),
    [meetings, enablePastMeetingDetails]
  );
  const visibleMeetings = useMemo(
    () =>
      viewMode === "CALENDAR"
        ? groupedMeetings.flatMap((group) => group.meetings)
        : recurringSeries.flatMap((series) => series.meetings),
    [groupedMeetings, recurringSeries, viewMode]
  );
  const meetingSummary = useMemo(() => {
    const linked = meetings.filter((meeting) => meeting.association.linked).length;
    const total = meetings.length;
    const overlaps = meetings.filter((meeting) => meeting.hasAccountOverlap).length;
    const recurrent = meetings.filter((meeting) => meeting.meetingKind === "RECURRENTE").length;
    return {
      total,
      linked,
      pending: Math.max(0, total - linked),
      overlaps,
      recurrent
    };
  }, [meetings]);

  async function fetchPastMeetingDetails(meeting: ZoomUpcomingMeeting, meetingKey: string) {
    if (!meeting.meetingId) {
      setDetailsErrorsByMeeting((prev) => ({
        ...prev,
        [meetingKey]: "No hay Meeting ID para consultar detalle."
      }));
      return;
    }

    setLoadingDetailsByMeeting((prev) => ({ ...prev, [meetingKey]: true }));
    setDetailsErrorsByMeeting((prev) => {
      const next = { ...prev };
      delete next[meetingKey];
      return next;
    });

    try {
      const response = await loadZoomPastMeetingDetails({
        meetingId: meeting.meetingId,
        meetingUuid: meeting.meetingUuid
      });

      if (response.error) {
        setDetailsErrorsByMeeting((prev) => ({
          ...prev,
          [meetingKey]: response.error ?? "No se pudo obtener el detalle."
        }));
        return;
      }

      setDetailsByMeeting((prev) => ({
        ...prev,
        [meetingKey]: response.details ?? null
      }));
    } finally {
      setLoadingDetailsByMeeting((prev) => ({ ...prev, [meetingKey]: false }));
    }
  }

  function togglePastMeetingDetails(meeting: ZoomUpcomingMeeting) {
    if (!enablePastMeetingDetails) return;
    const meetingKey = getMeetingCardKey(meeting);
    const hasCustomState = Object.prototype.hasOwnProperty.call(expandedDetailsByMeeting, meetingKey);
    const isOpen = hasCustomState
      ? Boolean(expandedDetailsByMeeting[meetingKey])
      : defaultDetailsExpanded;
    const nextOpen = !isOpen;

    setExpandedDetailsByMeeting((prev) => ({
      ...prev,
      [meetingKey]: nextOpen
    }));

    if (!nextOpen) return;
    if (loadingDetailsByMeeting[meetingKey]) return;
    if (Object.prototype.hasOwnProperty.call(detailsByMeeting, meetingKey)) return;

    void fetchPastMeetingDetails(meeting, meetingKey);
  }

  useEffect(() => {
    if (!enablePastMeetingDetails || !defaultDetailsExpanded) return;
    for (const meeting of visibleMeetings) {
      const meetingKey = getMeetingCardKey(meeting);
      if (!meeting.meetingId) continue;
      if (loadingDetailsByMeeting[meetingKey]) continue;
      if (Object.prototype.hasOwnProperty.call(detailsByMeeting, meetingKey)) continue;
      void fetchPastMeetingDetails(meeting, meetingKey);
    }
  }, [
    defaultDetailsExpanded,
    detailsByMeeting,
    enablePastMeetingDetails,
    loadingDetailsByMeeting,
    visibleMeetings
  ]);

  function openRegisterDialog(meeting: ZoomUpcomingMeeting) {
    if (!onRegisterUpcomingMeeting) return;

    const defaultResponsable =
      defaultResponsableNombre.trim() ||
      responsableOptions[0]?.value ||
      "";
    const defaultPrograma = programaOptions[0] ?? "";

    setRegisterForm({
      responsableNombre: defaultResponsable,
      programaNombre: defaultPrograma,
      modalidadReunion: "VIRTUAL",
      requiereAsistencia: false,
      descripcion: `Registro administrativo desde Zoom (${meeting.accountEmail || "sin cuenta"}).`
    });
    setRegisterDialogMeeting(meeting);
  }

  function closeRegisterDialog() {
    if (isRegisteringUpcomingMeeting) return;
    setRegisterDialogMeeting(null);
  }

  async function submitRegisterDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onRegisterUpcomingMeeting || !registerDialogMeeting || !registerDialogMeeting.meetingId) return;

    const created = await onRegisterUpcomingMeeting({
      meeting: registerDialogMeeting,
      responsableNombre: registerForm.responsableNombre.trim(),
      programaNombre: registerForm.programaNombre.trim(),
      modalidadReunion: registerForm.modalidadReunion,
      requiereAsistencia: registerForm.requiereAsistencia,
      descripcion: registerForm.descripcion.trim() || undefined
    });

    if (created) {
      setRegisterDialogMeeting(null);
    }
  }

  function renderMeetingCard(meeting: ZoomUpcomingMeeting, showTopic = true) {
    const accountKey = `${meeting.accountId}:${meeting.accountEmail}`.trim().toLowerCase();
    const meetingKey = getMeetingCardKey(meeting);
    const details = detailsByMeeting[meetingKey];
    const detailsError = detailsErrorsByMeeting[meetingKey];
    const detailsLoading = Boolean(loadingDetailsByMeeting[meetingKey]);
    const hasCustomOpenState = Object.prototype.hasOwnProperty.call(
      expandedDetailsByMeeting,
      meetingKey
    );
    const detailsOpen = hasCustomOpenState
      ? Boolean(expandedDetailsByMeeting[meetingKey])
      : defaultDetailsExpanded;
    const accountColor = accountColorMap.get(accountKey) ?? getZoomAccountColor(accountKey);

    return (
      <Paper
        key={meetingKey}
        variant="outlined"
        sx={{
          p: 1.2,
          borderRadius: 1.5,
          borderLeft: `5px solid ${accountColor.border}`,
          backgroundColor: meeting.hasAccountOverlap ? "error.50" : undefined
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
        >
          <Box>
            {showTopic ? (
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {meeting.topic}
              </Typography>
            ) : null}
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: showTopic ? 0.6 : 0 }}>
              <Chip
                size="small"
                color={meeting.association.linked ? "success" : "warning"}
                label={meeting.association.linked ? "Asociada" : "Pendiente"}
              />
              <Chip size="small" variant="outlined" label={formatZoomDateTime(meeting.startTime)} />
              <Chip size="small" variant="outlined" label={formatDurationHoursMinutes(meeting.durationMinutes)} />
              <Chip
                size="small"
                color={meeting.meetingKind === "RECURRENTE" ? "primary" : "default"}
                label={meeting.meetingKind === "RECURRENTE" ? "Recurrente" : "Unica"}
              />
              {meeting.hasAccountOverlap ? (
                <Chip size="small" color="error" label={`Se pisa (${meeting.accountOverlapCount})`} />
              ) : null}
            </Stack>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {meeting.joinUrl ? (
              <Button
                size="small"
                variant="contained"
                color="secondary"
                href={meeting.joinUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir en Zoom
              </Button>
            ) : null}
            {!meeting.association.linked && onRegisterUpcomingMeeting ? (
              <Button
                size="small"
                variant="outlined"
                onClick={() => openRegisterDialog(meeting)}
                disabled={!meeting.meetingId}
              >
                Registrar en sistema
              </Button>
            ) : null}
            {!meeting.association.linked && !onRegisterUpcomingMeeting && onCreatePostMeetingRecord ? (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onCreatePostMeetingRecord(meeting)}
              >
                Crear registro historico
              </Button>
            ) : null}
            {enablePastMeetingDetails ? (
              <Button
                size="small"
                variant="outlined"
                onClick={() => togglePastMeetingDetails(meeting)}
                disabled={!meeting.meetingId}
              >
                {detailsOpen ? "Ocultar detalle" : "Ver detalle"}
              </Button>
            ) : null}
          </Stack>
        </Stack>

        <Box
          sx={{
            mt: 1.2,
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))"
            },
            gap: 1
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              Cuenta
            </Typography>
            <Stack direction="row" spacing={0.8} alignItems="center">
              <Chip
                size="small"
                label={meeting.accountEmail || "-"}
                sx={{
                  bgcolor: accountColor.background,
                  color: accountColor.text,
                  border: `1px solid ${accountColor.border}`,
                  fontWeight: 700
                }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {meeting.accountName || "-"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Estado Zoom
            </Typography>
            <Typography variant="body2">{meeting.status || "-"}</Typography>
          </Box>
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
            <Typography variant="caption" color="text.secondary">
              Asociacion en sistema
            </Typography>
            <Box sx={{ mt: 0.4 }}>{renderAssociation(meeting)}</Box>
          </Box>
        </Box>

        {enablePastMeetingDetails && detailsOpen ? (
          <Paper
            variant="outlined"
            sx={{
              mt: 1.1,
              p: 1,
              borderRadius: 1.2,
              backgroundColor: "action.hover"
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Datos extra de Zoom
            </Typography>

            {detailsLoading ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Cargando detalle...
              </Typography>
            ) : detailsError ? (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="error.main">
                  {detailsError}
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    setDetailsByMeeting((prev) => {
                      const next = { ...prev };
                      delete next[meetingKey];
                      return next;
                    });
                    void fetchPastMeetingDetails(meeting, meetingKey);
                  }}
                >
                  Reintentar
                </Button>
              </Stack>
            ) : !details ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                No hay datos adicionales disponibles para esta reunion.
              </Typography>
            ) : (
              <Box
                sx={{
                  mt: 0.7,
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(3, minmax(0, 1fr))"
                  },
                  gap: 0.8
                }}
              >
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Asistencias registradas
                  </Typography>
                  <Typography variant="body2">
                    {formatNullableCount(details.participantsCount)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Asistentes unicos
                  </Typography>
                  <Typography variant="body2">
                    {formatNullableCount(details.uniqueParticipantsCount)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Instancias detectadas
                  </Typography>
                  <Typography variant="body2">
                    {formatNullableCount(details.pastInstancesCount)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Preguntas Q&A
                  </Typography>
                  <Typography variant="body2">
                    {formatNullableCount(details.qaQuestionsCount)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Duracion real
                  </Typography>
                  <Typography variant="body2">
                    {details.durationMinutes === null
                      ? "-"
                      : formatDurationHoursMinutes(details.durationMinutes)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Estado reportado
                  </Typography>
                  <Typography variant="body2">{details.status || "-"}</Typography>
                </Box>
              </Box>
            )}
          </Paper>
        ) : null}
      </Paper>
    );
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.2}
          alignItems={{ xs: "flex-start", sm: "flex-start" }}
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.45 }}>
              {subtitle}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
            {onSelectMonth && monthOptions.length > 0 ? (
              <TextField
                select
                size="small"
                label="Mes"
                value={selectedMonth}
                onChange={(event) => onSelectMonth(String(event.target.value))}
                disabled={isLoading || isLoadingMonthSelection}
                sx={{ minWidth: { xs: 220, sm: 240 } }}
              >
                {monthOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            <Button variant="outlined" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? "Actualizando..." : "Actualizar"}
            </Button>
            {onLoadMoreBack ? (
              <Button
                variant="outlined"
                onClick={onLoadMoreBack}
                disabled={isLoading || isLoadingMoreBack || !canLoadMoreBack}
              >
                {isLoadingMoreBack ? "Cargando mas..." : "Ver mas atras"}
              </Button>
            ) : null}
          </Stack>
        </Stack>

        <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mb: 1.3 }}>
          <Chip size="small" variant="outlined" label={`Grupo: ${groupName || "(sin nombre)"}`} />
          <Chip size="small" variant="outlined" label={`Total: ${meetingSummary.total}`} />
          <Chip size="small" color="success" variant="outlined" label={`Asociadas: ${meetingSummary.linked}`} />
          <Chip size="small" color="warning" variant="outlined" label={`Pendientes: ${meetingSummary.pending}`} />
          <Chip size="small" color="primary" variant="outlined" label={`Recurrentes: ${meetingSummary.recurrent}`} />
          {meetingSummary.overlaps > 0 ? (
            <Chip size="small" color="error" variant="outlined" label={`Cruces: ${meetingSummary.overlaps}`} />
          ) : null}
        </Stack>

        <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 2, mb: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} useFlexGap alignItems={{ md: "center" }}>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.35 }}>
                Vista
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={viewMode}
                onChange={(_event, value: ZoomViewMode | null) => {
                  if (value) setViewMode(value);
                }}
              >
                <ToggleButton value="CALENDAR">Calendario</ToggleButton>
                <ToggleButton value="RECURRENTES">Recurrentes</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {viewMode === "CALENDAR" ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.35 }}>
                  Agrupar por
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={grouping}
                  onChange={(_event, value: ZoomGroupingMode | null) => {
                    if (value) setGrouping(value);
                  }}
                >
                  <ToggleButton value="WEEK">Semanas</ToggleButton>
                  <ToggleButton value="MONTH">Meses</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            ) : null}
          </Stack>
        </Paper>

        {isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Cargando reuniones de Zoom...
          </Typography>
        ) : meetings.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay reuniones reportadas por Zoom.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {viewMode === "CALENDAR"
              ? groupedMeetings.map((group) => (
                  <Paper key={group.key} variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.8 }}>
                      {group.label} ({group.meetings.length})
                    </Typography>
                    <Stack spacing={1}>
                      {group.meetings.map((meeting) => renderMeetingCard(meeting, true))}
                    </Stack>
                  </Paper>
                ))
              : recurringSeries.length === 0
                ? (
                  <Typography variant="body2" color="text.secondary">
                    No hay reuniones recurrentes para mostrar.
                  </Typography>
                )
                : recurringSeries.map((series) => {
                  const firstMeeting = series.meetings[0];
                  const lastMeeting = series.meetings[series.meetings.length - 1];
                  const accountKey = firstMeeting
                    ? `${firstMeeting.accountId}:${firstMeeting.accountEmail}`.trim().toLowerCase()
                    : "";
                  const accountColor = accountColorMap.get(accountKey) ?? getZoomAccountColor(accountKey);

                  return (
                    <Paper key={series.key} variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={1}
                        alignItems={{ xs: "flex-start", md: "center" }}
                        justifyContent="space-between"
                        sx={{ mb: 1 }}
                      >
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {series.topic}
                          </Typography>
                          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                            <Chip size="small" color="primary" label="Recurrente" />
                            <Chip size="small" variant="outlined" label={`${series.meetings.length} instancias`} />
                            {series.meetingId ? (
                              <Chip size="small" variant="outlined" label={`Meeting ID ${series.meetingId}`} />
                            ) : null}
                          </Stack>
                          {firstMeeting && lastMeeting ? (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                              Rango: {formatZoomDateTime(firstMeeting.startTime)} a {formatZoomDateTime(lastMeeting.startTime)}
                            </Typography>
                          ) : null}
                        </Box>
                        {series.accountEmails.length === 1 ? (
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Cuenta
                            </Typography>
                            <Stack direction="row" spacing={0.8} alignItems="center">
                              <Chip
                                size="small"
                                label={series.accountEmails[0]}
                                sx={{
                                  bgcolor: accountColor.background,
                                  color: accountColor.text,
                                  border: `1px solid ${accountColor.border}`,
                                  fontWeight: 700
                                }}
                              />
                            </Stack>
                          </Box>
                        ) : (
                          <Chip size="small" variant="outlined" label={`${series.accountEmails.length} cuentas`} />
                        )}
                      </Stack>

                      <Stack spacing={1}>
                        {series.meetings.map((meeting) => renderMeetingCard(meeting, false))}
                      </Stack>
                    </Paper>
                  );
                })}
          </Stack>
        )}

        <Dialog
          open={Boolean(registerDialogMeeting)}
          onClose={closeRegisterDialog}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Registrar reunion en sistema</DialogTitle>
          <Box component="form" onSubmit={submitRegisterDialog}>
            <DialogContent dividers>
              <Stack spacing={1.25}>
                <Typography variant="body2" color="text.secondary">
                  Se registrará la reunion existente de Zoom sin crear una nueva.
                </Typography>
                <TextField
                  label="Reunion seleccionada"
                  value={
                    registerDialogMeeting
                      ? `${formatZoomDateTime(registerDialogMeeting.startTime)} | ${registerDialogMeeting.topic} | ID ${registerDialogMeeting.meetingId ?? "-"}`
                      : ""
                  }
                  InputProps={{ readOnly: true }}
                />
                <TextField
                  label="Cuenta anfitriona"
                  value={registerDialogMeeting?.accountEmail ?? "-"}
                  InputProps={{ readOnly: true }}
                />
                {programaOptions.length > 0 ? (
                  <TextField
                    select
                    required
                    label="Programa"
                    value={registerForm.programaNombre}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        programaNombre: event.target.value
                      }))
                    }
                  >
                    {programaOptions.map((programa) => (
                      <MenuItem key={programa} value={programa}>
                        {programa}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    required
                    label="Programa"
                    value={registerForm.programaNombre}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        programaNombre: event.target.value
                      }))
                    }
                  />
                )}
                {responsableOptions.length > 0 ? (
                  <TextField
                    select
                    required
                    label="Responsable"
                    value={registerForm.responsableNombre}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        responsableNombre: event.target.value
                      }))
                    }
                  >
                    {responsableOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    required
                    label="Responsable"
                    value={registerForm.responsableNombre}
                    onChange={(event) =>
                      setRegisterForm((prev) => ({
                        ...prev,
                        responsableNombre: event.target.value
                      }))
                    }
                  />
                )}
                <TextField
                  select
                  label="Modalidad"
                  value={registerForm.modalidadReunion}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      modalidadReunion: event.target.value as "VIRTUAL" | "HIBRIDA"
                    }))
                  }
                >
                  <MenuItem value="VIRTUAL">Virtual</MenuItem>
                  <MenuItem value="HIBRIDA">Hibrida</MenuItem>
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={registerForm.requiereAsistencia}
                      onChange={(event) =>
                        setRegisterForm((prev) => ({
                          ...prev,
                          requiereAsistencia: event.target.checked
                        }))
                      }
                    />
                  }
                  label="Requiere asistencia de monitoreo (quedará visible para asistentes Zoom)."
                />
                <TextField
                  label="Descripcion (opcional)"
                  multiline
                  minRows={2}
                  value={registerForm.descripcion}
                  onChange={(event) =>
                    setRegisterForm((prev) => ({
                      ...prev,
                      descripcion: event.target.value
                    }))
                  }
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={closeRegisterDialog} disabled={isRegisteringUpcomingMeeting}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={!canSubmitRegisterDialog || isRegisteringUpcomingMeeting}
              >
                {isRegisteringUpcomingMeeting ? "Guardando..." : "Registrar"}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>
      </CardContent>
    </Card>
  );
}
