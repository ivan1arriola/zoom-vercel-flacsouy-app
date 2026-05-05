"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import LinkIcon from "@mui/icons-material/Link";
import SchoolIcon from "@mui/icons-material/School";
import TerminalIcon from "@mui/icons-material/Terminal";
import HistoryIcon from "@mui/icons-material/History";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Tooltip from "@mui/material/Tooltip";
import {
  loadZoomPastMeetingDetails,
  type ZoomPastMeetingDetails,
  type ZoomUpcomingMeeting
} from "@/src/services/zoomApi";
import {
  formatDurationHoursMinutes,
  formatZoomDateTime,
  getZoomAccountColor,
  buildZoomAccountColorMap,
  normalizeZoomMeetingId
} from "@/components/spa-tabs/spa-tabs-utils";
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";

type ZoomGroupingMode = "WEEK" | "MONTH";
type ZoomViewMode = "CALENDAR" | "RECURRENTES";

type ZoomMeetingGroup = {
  key: string;
  label: string;
  meetings: ZoomUpcomingMeeting[];
};

type ZoomMeetingGroupByDay = {
  key: string;
  label: string;
  meetings: ZoomUpcomingMeeting[];
};

type ZoomMeetingsByMonthAndDay = {
  key: string;
  label: string;
  dayGroups: ZoomMeetingGroupByDay[];
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

function groupMeetingsByMonthAndDay(meetings: ZoomUpcomingMeeting[]): ZoomMeetingsByMonthAndDay[] {
  const monthGrouped = new Map<string, Map<string, ZoomMeetingGroupByDay>>();

  for (const meeting of meetings) {
    const startDate = new Date(meeting.startTime);
    if (Number.isNaN(startDate.getTime())) continue;

    const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = new Intl.DateTimeFormat("es-UY", {
      month: "long",
      year: "numeric"
    }).format(startDate);

    const dayKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(
      startDate.getDate()
    ).padStart(2, "0")}`;
    const dayLabel = new Intl.DateTimeFormat("es-UY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(startDate);

    let dayGroups = monthGrouped.get(monthKey);
    if (!dayGroups) {
      dayGroups = new Map();
      monthGrouped.set(monthKey, dayGroups);
    }

    const existingDay = dayGroups.get(dayKey);
    if (existingDay) {
      existingDay.meetings.push(meeting);
    } else {
      dayGroups.set(dayKey, {
        key: dayKey,
        label: dayLabel,
        meetings: [meeting]
      });
    }
  }

  const result: ZoomMeetingsByMonthAndDay[] = [];
  for (const [monthKey, dayGroups] of monthGrouped.entries()) {
    const dayGroupsArray = Array.from(dayGroups.values());
    dayGroupsArray.sort((a, b) => a.key.localeCompare(b.key));
    if (dayGroupsArray.length === 0 || dayGroupsArray[0].meetings.length === 0) {
      continue;
    }

    const firstDate = new Date(dayGroupsArray[0].meetings[0].startTime);
    const monthLabel = new Intl.DateTimeFormat("es-UY", {
      month: "long",
      year: "numeric"
    }).format(firstDate);

    result.push({
      key: monthKey,
      label: monthLabel,
      dayGroups: dayGroupsArray
    });
  }

  result.sort((a, b) => a.key.localeCompare(b.key));
  return result;
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
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, color: "warning.main" }}>
        <HistoryIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase" }}>
          Sin asociación
        </Typography>
      </Box>
    );
  }

  const programaNombre = meeting.association.solicitudProgramaNombre?.trim();

  return (
    <Stack spacing={0.5}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, color: "success.main" }}>
        <SchoolIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption" sx={{ fontWeight: 800, textTransform: "uppercase" }}>
          Asociada
        </Typography>
      </Box>
      {programaNombre ? (
        <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.2 }}>
          {programaNombre}
        </Typography>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Solicitud: {meeting.association.solicitudId}
        </Typography>
      )}
    </Stack>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SpaTabProximasReuniones({
  title = "Próximas reuniones (Zoom)",
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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
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
  const [copyFeedback, setCopyFeedback] = useState<Record<string, string>>({});

  const handleCopy = async (text: string, key: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopyFeedback(prev => ({ ...prev, [key]: "¡Copiado!" }));
      setTimeout(() => setCopyFeedback(prev => ({ ...prev, [key]: "" })), 2000);
    }
  };

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
  const groupedMeetingsByMonthAndDay = useMemo(
    () => {
      if (grouping === "MONTH") {
        return groupMeetingsByMonthAndDay(meetings);
      }
      return [];
    },
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
  const recurrenceCountByMeetingId = useMemo(() => {
    const map = new Map<string, number>();
    for (const meeting of meetings) {
      const meetingId = normalizeZoomMeetingId(meeting.meetingId);
      if (!meetingId) continue;
      map.set(meetingId, (map.get(meetingId) ?? 0) + 1);
    }
    return map;
  }, [meetings]);
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
    const meetingId = normalizeZoomMeetingId(meeting.meetingId) ?? "-";
    const recurringCount = meetingId === "-" ? 1 : recurrenceCountByMeetingId.get(meetingId) ?? 1;
    const hostAccount = meeting.accountEmail?.trim() || meeting.accountName?.trim() || null;
    const joinUrl = meeting.joinUrl?.trim() ?? "";
    const assistantStatus = meeting.association.assistantStatus;
    const requiresAssistance = assistantStatus !== "NO_APLICA";
    const assistantName = assistantStatus === "ASIGNADO" ? meeting.association.assistantName : null;
    const assistantEmail = assistantStatus === "ASIGNADO" ? meeting.association.assistantEmail : null;

    return (
      <Paper
        key={meetingKey}
        variant="outlined"
        sx={{
          p: 2.5,
          borderRadius: 4,
          borderLeft: `6px solid ${accountColor.border}`,
          backgroundColor: meeting.hasAccountOverlap ? (isDarkMode ? alpha(theme.palette.error.main, 0.1) : "error.50") : "background.paper",
          transition: "all 0.2s ease-in-out",
          position: "relative",
          overflow: "hidden",
          "&:hover": {
            boxShadow: theme.shadows[4],
            borderColor: accountColor.border,
            transform: "translateY(-2px)"
          }
        }}
      >
        <Stack spacing={2.5}>
          {/* Top Section: Topic & Primary Actions */}
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Box sx={{ flex: 1 }}>
              {showTopic && (
                <Typography variant="h6" sx={{ fontWeight: 900, mb: 1, letterSpacing: "-0.01em", color: "text.primary" }}>
                  {meeting.topic}
                </Typography>
              )}
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  icon={meeting.association.linked ? <CheckIcon /> : undefined}
                  color={meeting.association.linked ? "success" : "warning"}
                  label={meeting.association.linked ? "Asociada" : "Pendiente de vínculo"}
                  sx={{ fontWeight: 800, px: 0.5 }}
                />
                <Chip 
                  size="small" 
                  variant="outlined" 
                  icon={<CalendarTodayIcon sx={{ fontSize: "0.8rem !important" }} />}
                  label={formatZoomDateTime(meeting.startTime)} 
                  sx={{ fontWeight: 700 }}
                />
                <Chip 
                  size="small" 
                  variant="outlined" 
                  icon={<AccessTimeIcon sx={{ fontSize: "0.8rem !important" }} />}
                  label={formatDurationHoursMinutes(meeting.durationMinutes)} 
                  sx={{ fontWeight: 700 }}
                />
                <Chip
                  size="small"
                  variant={meeting.meetingKind === "RECURRENTE" ? "filled" : "outlined"}
                  color={meeting.meetingKind === "RECURRENTE" ? "primary" : "default"}
                  label={meeting.meetingKind === "RECURRENTE" ? "Recurrente" : "Única"}
                  sx={{ fontWeight: 700 }}
                />
                {meeting.hasAccountOverlap && (
                  <Chip 
                    size="small" 
                    color="error" 
                    variant="filled"
                    label={`Conflicto (${meeting.accountOverlapCount})`} 
                    sx={{ fontWeight: 900, animation: "pulse 2s infinite" }}
                  />
                )}
              </Stack>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              {joinUrl && (
                <Stack direction="row" spacing={0} sx={{ 
                  borderRadius: 3, 
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: alpha(theme.palette.success.main, 0.3),
                  bgcolor: alpha(theme.palette.success.main, 0.05),
                }}>
                  <Button
                    size="small"
                    component="a"
                    href={joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    startIcon={<OpenInNewIcon />}
                    sx={{ 
                      fontWeight: 900, 
                      color: "success.dark",
                      px: 2,
                      "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.1) }
                    }}
                  >
                    Unirse
                  </Button>
                  <Divider orientation="vertical" flexItem sx={{ borderColor: alpha(theme.palette.success.main, 0.2) }} />
                  <Tooltip title={copyFeedback[meetingKey] || "Copiar link de invitación"}>
                    <IconButton 
                      size="small" 
                      onClick={() => handleCopy(joinUrl, meetingKey)}
                      sx={{ 
                        color: "success.main",
                        borderRadius: 0,
                        "&:hover": { bgcolor: alpha(theme.palette.success.main, 0.1) }
                      }}
                    >
                      {copyFeedback[meetingKey] ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </Stack>
              )}
              
              {!meeting.association.linked && onRegisterUpcomingMeeting && (
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => openRegisterDialog(meeting)}
                  disabled={!meeting.meetingId}
                  sx={{ fontWeight: 800, borderRadius: 2.5 }}
                >
                  Vincular
                </Button>
              )}
              
              {enablePastMeetingDetails && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => togglePastMeetingDetails(meeting)}
                  disabled={!meeting.meetingId}
                  sx={{ fontWeight: 700, borderRadius: 2.5 }}
                >
                  {detailsOpen ? "Ocultar detalles" : "Ver detalles"}
                </Button>
              )}
            </Stack>
          </Stack>

          <Divider />

          {/* Grid Section: Metadata Details */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={0.5}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 0.5 }}>
                  <AccountCircleIcon sx={{ fontSize: 14 }} /> Cuenta Anfitriona
                </Typography>
                <Chip
                  size="small"
                  label={meeting.accountEmail || "-"}
                  sx={{
                    bgcolor: alpha(accountColor.background, 0.6),
                    color: accountColor.text,
                    border: `1px solid ${accountColor.border}`,
                    fontWeight: 800,
                    width: "fit-content",
                    maxWidth: "100%"
                  }}
                />
                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", ml: 0.5 }}>
                  {meeting.accountName || "-"}
                </Typography>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <Stack spacing={0.5}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 0.5 }}>
                  <TerminalIcon sx={{ fontSize: 14 }} /> ID Reunión
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em" }}>
                  {meetingId}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {recurringCount} {recurringCount === 1 ? "instancia" : "instancias"}
                </Typography>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Stack spacing={0.5}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 0.5 }}>
                  <LinkIcon sx={{ fontSize: 14 }} /> Asistente Zoom
                </Typography>
                <MeetingAssistantStatusChip
                  requiresAssistance={requiresAssistance}
                  assistantName={assistantName}
                  assistantEmail={assistantEmail}
                  pendingLabel={meeting.association.linked ? "Pendiente" : "Falta vínculo"}
                />
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Stack spacing={0.5}>
                <Typography variant="caption" sx={{ fontWeight: 800, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 0.5 }}>
                  <SchoolIcon sx={{ fontSize: 14 }} /> Programa / Vínculo
                </Typography>
                <Box>{renderAssociation(meeting)}</Box>
              </Stack>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Box sx={{ 
                p: 1.5, 
                borderRadius: 2, 
                bgcolor: isDarkMode ? alpha(theme.palette.warning.main, 0.05) : alpha(theme.palette.warning.main, 0.02),
                border: "1px dashed",
                borderColor: alpha(theme.palette.warning.main, 0.2)
              }}>
                <ZoomAccountPasswordField
                  hostAccount={hostAccount}
                  label="Contraseña de la cuenta Zoom"
                />
              </Box>
            </Grid>
          </Grid>
        </Stack>

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
    <Card 
      variant="outlined" 
      sx={{ 
        borderRadius: 5, 
        border: "none",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        overflow: "visible" 
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 4 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", sm: "flex-start" }}
          justifyContent="space-between"
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: "-1.5px", color: "text.primary", mb: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="body1" sx={{ color: "text.secondary", fontWeight: 500, maxWidth: 600 }}>
              {subtitle}
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={1.5} alignItems="center">
            {onSelectMonth && monthOptions.length > 0 && (
              <TextField
                select
                size="small"
                label="Período"
                value={selectedMonth}
                onChange={(event) => onSelectMonth(String(event.target.value))}
                disabled={isLoading || isLoadingMonthSelection}
                sx={{ 
                  minWidth: { xs: 160, sm: 220 },
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 3,
                    bgcolor: "background.paper",
                    fontWeight: 700
                  }
                }}
              >
                {monthOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value} sx={{ fontWeight: 600 }}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            
            <Button 
              variant="contained" 
              onClick={onRefresh} 
              disabled={isLoading}
              sx={{ 
                borderRadius: 3, 
                fontWeight: 900, 
                px: 3, 
                boxShadow: theme.shadows[2],
                textTransform: "none"
              }}
            >
              {isLoading ? "Cargando..." : "Actualizar"}
            </Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 4 }}>
          <Chip 
            size="medium" 
            variant="filled" 
            label={`Grupo: ${groupName || "Global"}`} 
            sx={{ fontWeight: 800, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.dark" }}
          />
          <Chip 
            size="medium" 
            variant="filled" 
            label={`Total: ${meetingSummary.total}`} 
            sx={{ fontWeight: 800, bgcolor: "text.primary", color: "background.paper" }}
          />
          <Chip 
            size="medium" 
            color="success" 
            variant="filled" 
            label={`Asociadas: ${meetingSummary.linked}`} 
            sx={{ fontWeight: 800 }}
          />
          <Chip 
            size="medium" 
            color="warning" 
            variant="filled" 
            label={`Pendientes: ${meetingSummary.pending}`} 
            sx={{ fontWeight: 800 }}
          />
          <Chip 
            size="medium" 
            color="info" 
            variant="filled" 
            label={`Recurrentes: ${meetingSummary.recurrent}`} 
            sx={{ fontWeight: 800 }}
          />
          {meetingSummary.overlaps > 0 && (
            <Chip 
              size="medium" 
              color="error" 
              variant="filled" 
              label={`Cruces: ${meetingSummary.overlaps}`} 
              sx={{ fontWeight: 900, animation: "pulse 2s infinite" }}
            />
          )}
        </Stack>

        <Paper 
          variant="outlined" 
          sx={{ 
            p: 2, 
            borderRadius: 4, 
            mb: 4, 
            bgcolor: alpha(theme.palette.primary.main, 0.02),
            border: "1px solid",
            borderColor: alpha(theme.palette.primary.main, 0.1)
          }}
        >
          <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ md: "center" }}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 900, color: "text.secondary", textTransform: "uppercase", display: "block", mb: 1, letterSpacing: "0.1em" }}>
                Modo de Vista
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={viewMode}
                onChange={(_event, value: ZoomViewMode | null) => {
                  if (value) setViewMode(value);
                }}
                sx={{ 
                  "& .MuiToggleButton-root": { 
                    px: 3, 
                    fontWeight: 800, 
                    borderRadius: 2,
                    textTransform: "none"
                  } 
                }}
              >
                <ToggleButton value="CALENDAR">Calendario</ToggleButton>
                <ToggleButton value="RECURRENTES">Series Recurrentes</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {viewMode === "CALENDAR" && (
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 900, color: "text.secondary", textTransform: "uppercase", display: "block", mb: 1, letterSpacing: "0.1em" }}>
                  Agrupación Temporal
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={grouping}
                  onChange={(_event, value: ZoomGroupingMode | null) => {
                    if (value) setGrouping(value);
                  }}
                  sx={{ 
                    "& .MuiToggleButton-root": { 
                      px: 3, 
                      fontWeight: 800, 
                      borderRadius: 2,
                      textTransform: "none"
                    } 
                  }}
                >
                  <ToggleButton value="WEEK">Semanas</ToggleButton>
                  <ToggleButton value="MONTH">Meses</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            {onLoadMoreBack && (
              <Box sx={{ ml: { md: "auto" } }}>
                <Button
                  variant="outlined"
                  onClick={onLoadMoreBack}
                  disabled={isLoading || isLoadingMoreBack || !canLoadMoreBack}
                  startIcon={<HistoryIcon />}
                  sx={{ borderRadius: 3, fontWeight: 700 }}
                >
                  {isLoadingMoreBack ? "Cargando..." : "Historial anterior"}
                </Button>
              </Box>
            )}
          </Stack>
        </Paper>

        {isLoading ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <CircularProgress size={40} thickness={4} />
            <Typography variant="body1" sx={{ mt: 2, fontWeight: 600, color: "text.secondary" }}>
              Sincronizando agenda de Zoom...
            </Typography>
          </Box>
        ) : meetings.length === 0 ? (
          <Paper sx={{ py: 8, textAlign: "center", borderRadius: 4, bgcolor: "background.paper", border: "1px dashed", borderColor: "divider" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "text.secondary" }}>
              No hay reuniones reportadas
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Intenta actualizar o cambiar el período seleccionado.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={4}>
            {viewMode === "CALENDAR"
              ? grouping === "MONTH"
                ? groupedMeetingsByMonthAndDay.map((monthGroup) => (
                    <Box key={monthGroup.key}>
                      <Typography variant="h5" sx={{ fontWeight: 900, mb: 3, color: "primary.main", letterSpacing: "-0.02em", display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box sx={{ width: 4, height: 24, bgcolor: "primary.main", borderRadius: 1 }} />
                        {monthGroup.label}
                        <Chip 
                          label={monthGroup.dayGroups.reduce((acc, dg) => acc + dg.meetings.length, 0)} 
                          size="small" 
                          sx={{ fontWeight: 900, bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" }} 
                        />
                      </Typography>
                      <Stack spacing={3}>
                        {monthGroup.dayGroups.map((dayGroup) => (
                          <Box key={dayGroup.key}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1.5, color: "text.secondary", textTransform: "capitalize", pl: 0.5 }}>
                              {dayGroup.label} ({dayGroup.meetings.length})
                            </Typography>
                            <Stack spacing={2.5}>
                              {dayGroup.meetings.map((meeting) => renderMeetingCard(meeting, true))}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  ))
                : groupedMeetings.map((group) => (
                    <Box key={group.key}>
                      <Typography variant="h5" sx={{ fontWeight: 900, mb: 2, color: "primary.main", letterSpacing: "-0.02em" }}>
                        {group.label} ({group.meetings.length})
                      </Typography>
                      <Stack spacing={2.5}>
                        {group.meetings.map((meeting) => renderMeetingCard(meeting, true))}
                      </Stack>
                    </Box>
                  ))
              : recurringSeries.length === 0
                ? (
                  <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                    No hay series recurrentes detectadas.
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
