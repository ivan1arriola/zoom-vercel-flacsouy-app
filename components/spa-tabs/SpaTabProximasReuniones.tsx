"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import type { ZoomUpcomingMeeting } from "@/src/services/zoomApi";
import {
  formatDurationHoursMinutes,
  formatZoomDateTime,
  getZoomAccountColor,
  buildZoomAccountColorMap
} from "@/components/spa-tabs/spa-tabs-utils";

type ZoomGroupingMode = "WEEK" | "MONTH";

type ZoomMeetingGroup = {
  key: string;
  label: string;
  meetings: ZoomUpcomingMeeting[];
};

interface SpaTabProximasReunionesProps {
  title?: string;
  subtitle?: string;
  groupName: string;
  meetings: ZoomUpcomingMeeting[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePostMeetingRecord?: (meeting: ZoomUpcomingMeeting) => void;
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

function renderAssociation(meeting: ZoomUpcomingMeeting) {
  if (!meeting.association.linked) {
    return <Chip size="small" color="warning" label="Sin asociar" />;
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
  onCreatePostMeetingRecord
}: SpaTabProximasReunionesProps) {
  const [grouping, setGrouping] = useState<ZoomGroupingMode>("MONTH");

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

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
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
            <Button variant="outlined" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? "Actualizando..." : "Actualizar"}
            </Button>
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {subtitle}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Grupo: {groupName || "(sin nombre)"} - Total: {meetings.length}
        </Typography>

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
            {groupedMeetings.map((group) => (
              <Paper key={group.key} variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.8 }}>
                  {group.label} ({group.meetings.length})
                </Typography>

                <Stack spacing={1}>
                  {group.meetings.map((meeting) => {
                    const accountKey = `${meeting.accountId}:${meeting.accountEmail}`.trim().toLowerCase();
                    const accountColor =
                      accountColorMap.get(accountKey) ?? getZoomAccountColor(accountKey);

                    return (
                      <Paper
                        key={`${meeting.accountId}:${meeting.id}:${meeting.startTime}`}
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
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {meeting.topic}
                            </Typography>
                            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
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
                                Abrir
                              </Button>
                            ) : null}
                            {!meeting.association.linked && onCreatePostMeetingRecord ? (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => onCreatePostMeetingRecord(meeting)}
                              >
                                Crear registro
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
                      </Paper>
                    );
                  })}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
