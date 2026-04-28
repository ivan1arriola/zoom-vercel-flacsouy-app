"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Skeleton,
  Avatar
} from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import AssignmentLateRoundedIcon from "@mui/icons-material/AssignmentLateRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
import CancelScheduleSendOutlinedIcon from "@mui/icons-material/CancelScheduleSendOutlined";
import { formatDuration } from "@/src/lib/spa-home/recurrence";
import { formatModalidad, formatZoomDate, formatZoomTime, formatDurationHuman } from "./spa-tabs-utils";
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";
import type {
  AssignmentBoardEvent,
  AssignableAssistant,
  AssignmentSuggestion
} from "@/src/services/dashboardApi";

interface SpaTabAsignacionProps {
  assignmentBoardEvents: AssignmentBoardEvent[];
  assignableAssistants: AssignableAssistant[];
  isLoadingAssignmentBoard: boolean;
  assignmentSuggestion: AssignmentSuggestion | null;
  isLoadingSuggestion: boolean;
  hasSuggestionSession: boolean;
  assigningEventId: string | null;
  removingAssistanceEventId: string | null;
  selectedAssistantByEvent: Record<string, string>;
  onSelectedAssistantChange: (eventId: string, assistantId: string) => void;
  onAssignAssistant: (eventId: string) => void;
  onRemoveAssistanceForEvent: (input: {
    eventoId: string;
    solicitudId: string;
    titulo: string;
    inicioProgramadoAt: string;
  }) => void;
  onSuggestMonthly: () => void;
  onSuggestNext: () => void;
}

function normalizeZoomMeetingId(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

export function SpaTabAsignacion({
  assignmentBoardEvents,
  assignableAssistants,
  isLoadingAssignmentBoard,
  assignmentSuggestion,
  isLoadingSuggestion,
  hasSuggestionSession,
  assigningEventId,
  removingAssistanceEventId,
  selectedAssistantByEvent,
  onSelectedAssistantChange,
  onAssignAssistant,
  onRemoveAssistanceForEvent,
  onSuggestMonthly,
  onSuggestNext
}: SpaTabAsignacionProps) {
  const [viewMode, setViewMode] = useState<"pending" | "assigned">("pending");
  const sortedEvents = useMemo(
    () =>
      [...assignmentBoardEvents].sort(
        (a, b) =>
          new Date(a.inicioProgramadoAt).getTime() - new Date(b.inicioProgramadoAt).getTime()
      ),
    [assignmentBoardEvents]
  );

  const pendingEvents = useMemo(
    () => sortedEvents.filter((event) => !event.currentAssignment),
    [sortedEvents]
  );

  const assignedEvents = useMemo(
    () => sortedEvents.filter((event) => Boolean(event.currentAssignment)),
    [sortedEvents]
  );
  const recurrenceCountByMeetingId = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of sortedEvents) {
      const meetingId = normalizeZoomMeetingId(event.zoomMeetingId);
      if (!meetingId) continue;
      map.set(meetingId, (map.get(meetingId) ?? 0) + 1);
    }
    return map;
  }, [sortedEvents]);

  const assignedByAssistant = useMemo(() => {
    const byAssistant = new Map<
      string,
      {
        asistenteZoomId: string;
        nombre: string;
        email: string;
        events: AssignmentBoardEvent[];
      }
    >();

    for (const event of assignedEvents) {
      const assignment = event.currentAssignment;
      if (!assignment) continue;

      const existing = byAssistant.get(assignment.asistenteZoomId);
      if (existing) {
        existing.events.push(event);
        continue;
      }

      byAssistant.set(assignment.asistenteZoomId, {
        asistenteZoomId: assignment.asistenteZoomId,
        nombre: assignment.nombre,
        email: assignment.email,
        events: [event]
      });
    }

    return Array.from(byAssistant.values()).sort((left, right) => {
      if (right.events.length !== left.events.length) {
        return right.events.length - left.events.length;
      }
      return left.nombre.localeCompare(right.nombre, "es");
    });
  }, [assignedEvents]);

  function buildOptionsForEvent(item: AssignmentBoardEvent): Array<{ id: string; label: string }> {
    const currentAssignment = item.currentAssignment ?? null;
    const optionsMap = new Map<string, { id: string; label: string }>();

    if (currentAssignment) {
      optionsMap.set(currentAssignment.asistenteZoomId, {
        id: currentAssignment.asistenteZoomId,
        label: `${currentAssignment.nombre} (${currentAssignment.email})`
      });
    }

    for (const interest of item.interesados) {
      if (!optionsMap.has(interest.asistenteZoomId)) {
        optionsMap.set(interest.asistenteZoomId, {
          id: interest.asistenteZoomId,
          label: `${interest.nombre} (${interest.email})`
        });
      }
    }

    return Array.from(optionsMap.values());
  }

  function renderEventCard(item: AssignmentBoardEvent, section: "pending" | "assigned") {
    const currentAssignment = item.currentAssignment ?? null;
    const options = buildOptionsForEvent(item);
    const selectedAssistantId = selectedAssistantByEvent[item.id] ?? "";
    const isReassignment = Boolean(currentAssignment) && Boolean(selectedAssistantId) && selectedAssistantId !== currentAssignment?.asistenteZoomId;
    const isNoopSelection = Boolean(currentAssignment) && selectedAssistantId === currentAssignment?.asistenteZoomId;
    const isPending = section === "pending";
    const hasNoInterested = item.interesados.length === 0;
    
    const actionDisabled = assigningEventId === item.id || !selectedAssistantId || isNoopSelection || hasNoInterested;
    
    const suggestedAssignment = assignmentSuggestion?.events.find((suggested) => suggested.eventoId === item.id) ?? null;
    const canApplySuggestionToSelector = Boolean(suggestedAssignment) && selectedAssistantId !== (suggestedAssignment?.asistenteZoomId ?? "");
    
    const meetingId = normalizeZoomMeetingId(item.zoomMeetingId) ?? "-";
    const recurringCount = meetingId === "-" ? 1 : recurrenceCountByMeetingId.get(meetingId) ?? 1;
    const hostAccount = item.cuentaZoom?.ownerEmail?.trim() || item.cuentaZoom?.nombreCuenta?.trim() || "-";

    return (
      <Card 
        key={item.id}
        variant="outlined" 
        sx={{ 
          borderRadius: 3, 
          mb: 1.5,
          borderLeft: "6px solid",
          borderLeftColor: isPending ? "warning.main" : "success.main",
          bgcolor: isPending ? "rgba(237, 108, 2, 0.02)" : "rgba(46, 125, 50, 0.02)",
          transition: "box-shadow 0.2s",
          "&:hover": { boxShadow: 2 }
        }}
      >
        <CardContent sx={{ p: 2 }}>
          {/* Header Row */}
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={2} sx={{ mb: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                {item.solicitud.titulo}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
                <Chip size="small" variant="filled" color={isPending ? "warning" : "success"} label={isPending ? "Pendiente" : "Asignada"} />
                <Chip size="small" variant="outlined" label={formatModalidad(item.modalidadReunion)} />
                <Chip size="small" variant="outlined" label={formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)} />
                {recurringCount > 1 && <Chip size="small" variant="outlined" label={`${recurringCount} instancias`} color="secondary" />}
              </Stack>
            </Box>
            
            {/* Quick Info Box (Date/Time) */}
            <Paper variant="outlined" sx={{ p: 1, px: 2, borderRadius: 2, bgcolor: "background.paper", minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary" display="block">Fecha y Hora</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatZoomDate(item.inicioProgramadoAt)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatZoomTime(item.inicioProgramadoAt)} - {formatZoomTime(item.finProgramadoAt)} ({formatDurationHuman(item.inicioProgramadoAt, item.finProgramadoAt)})
              </Typography>
            </Paper>
          </Stack>

          <Divider sx={{ my: 2 }} />

          {/* Details & Actions Row */}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1.5fr" }, gap: 3 }}>
            
            {/* Left: Meeting Details */}
            <Stack spacing={1.5}>
              <Box>
                <Typography variant="caption" color="text.secondary">Cuenta Streaming</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{hostAccount}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">ID Reunión Zoom</Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{meetingId}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Programa</Typography>
                <Typography variant="body2">{item.solicitud.programaNombre || "-"}</Typography>
              </Box>
            </Stack>

            {/* Right: Assignment Actions */}
            {isPending ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "background.paper" }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                  Gestión de Asignación
                </Typography>
                
                {hasNoInterested ? (
                  <Alert severity="warning" sx={{ py: 0, mb: 1 }}>
                    No hay postulantes para esta reunión.
                  </Alert>
                ) : (
                  <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="body2" sx={{ alignSelf: "center", mr: 1 }}>Interesados:</Typography>
                    {item.interesados.map(int => (
                      <Chip key={int.asistenteZoomId} size="small" avatar={<Avatar>{int.nombre[0]}</Avatar>} label={int.nombre} />
                    ))}
                  </Stack>
                )}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
                  <TextField
                    select
                    size="small"
                    fullWidth
                    disabled={hasNoInterested}
                    value={selectedAssistantId}
                    onChange={(e) => onSelectedAssistantChange(item.id, e.target.value)}
                    label="Seleccionar Asistente"
                  >
                    <MenuItem value=""><em>Ninguno</em></MenuItem>
                    {options.map((option) => (
                      <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                    ))}
                  </TextField>
                  <Button
                    variant="contained"
                    onClick={() => onAssignAssistant(item.id)}
                    disabled={actionDisabled}
                    sx={{ minWidth: 120, height: 40 }}
                    disableElevation
                  >
                    {assigningEventId === item.id ? "Guardando..." : "Asignar"}
                  </Button>
                </Stack>

                {suggestedAssignment && (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2, p: 1, bgcolor: "info.lighter", borderRadius: 1 }}>
                    <AutoAwesomeRoundedIcon fontSize="small" color="info" />
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      Sugerencia: <strong>{suggestedAssignment.asistenteNombre}</strong>
                    </Typography>
                    <Button 
                      size="small" 
                      onClick={() => onSelectedAssistantChange(item.id, suggestedAssignment.asistenteZoomId)}
                      disabled={!canApplySuggestionToSelector}
                    >
                      Aplicar
                    </Button>
                  </Stack>
                )}
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "background.paper", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                  Personal Asignado
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <Avatar sx={{ bgcolor: "success.main" }}>{currentAssignment?.nombre[0]}</Avatar>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{currentAssignment?.nombre}</Typography>
                    <Typography variant="body2" color="text.secondary">{currentAssignment?.email}</Typography>
                  </Box>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    onClick={() => setViewMode("pending")}
                  >
                    Modificar
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    color="error"
                    onClick={() => onRemoveAssistanceForEvent({
                      eventoId: item.id,
                      solicitudId: item.solicitud.id,
                      titulo: item.solicitud.titulo,
                      inicioProgramadoAt: item.inicioProgramadoAt
                    })}
                    disabled={removingAssistanceEventId === item.id}
                  >
                    {removingAssistanceEventId === item.id ? "Removiendo..." : "Quitar asistencia"}
                  </Button>
                </Stack>
              </Paper>
            )}

          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Top Metrics Row */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
        {[
          { key: "total", label: "Total reuniones", value: sortedEvents.length, icon: <EventNoteRoundedIcon color="primary" />, tone: "primary.main" },
          { key: "pending", label: "Sin asistencia", value: pendingEvents.length, icon: <AssignmentLateRoundedIcon color="warning" />, tone: "warning.main" },
          { key: "assigned", label: "Ya asignadas", value: assignedEvents.length, icon: <AssignmentTurnedInRoundedIcon color="success" />, tone: "success.main" },
          { key: "people", label: "Personal activo", value: assignedByAssistant.length, icon: <GroupRoundedIcon color="info" />, tone: "info.main" }
        ].map((metric) => (
          <Paper key={metric.key} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${metric.tone}1A` }}>
                {metric.icon}
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900, color: metric.tone, lineHeight: 1 }}>{metric.value}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{metric.label}</Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Box>

      {/* Auto-suggest Action Bar */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3, bgcolor: "primary.lighter", borderColor: "primary.light", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "primary.dark", display: "flex", alignItems: "center", gap: 1 }}>
            <AutoAwesomeRoundedIcon fontSize="small" /> Asignación Inteligente
          </Typography>
          <Typography variant="body2" color="primary.main" sx={{ mt: 0.5 }}>
            Genera una propuesta equilibrada automáticamente basándose en las tarifas y la carga mensual.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={onSuggestMonthly} disabled={isLoadingSuggestion} disableElevation>
            {isLoadingSuggestion ? "Calculando..." : "Generar Sugerencia"}
          </Button>
          {hasSuggestionSession && (
            <Button variant="outlined" onClick={onSuggestNext} disabled={isLoadingSuggestion}>
              Buscar otra opción
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Main Content Area */}
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: "grey.50" }}>
          <Stack direction="row" sx={{ px: 2, pt: 2 }}>
            <ToggleButtonGroup
              size="medium"
              exclusive
              value={viewMode}
              onChange={(_event, value: "pending" | "assigned" | null) => {
                if (value) setViewMode(value);
              }}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="pending" sx={{ px: 3, fontWeight: 700 }}>
                Pendientes <Chip size="small" label={pendingEvents.length} color="warning" sx={{ ml: 1, height: 20 }} />
              </ToggleButton>
              <ToggleButton value="assigned" sx={{ px: 3, fontWeight: 700 }}>
                Asignadas <Chip size="small" label={assignedEvents.length} color="success" sx={{ ml: 1, height: 20 }} />
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Box>
        
        <CardContent sx={{ p: { xs: 2, md: 3 }, bgcolor: "grey.50" }}>
          {isLoadingAssignmentBoard ? (
            <Stack spacing={2}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rectangular" height={160} sx={{ borderRadius: 3 }} />
              ))}
            </Stack>
          ) : viewMode === "pending" ? (
            pendingEvents.length === 0 ? (
              <Alert severity="success" sx={{ borderRadius: 2 }}>¡Excelente! No hay reuniones pendientes de asignación.</Alert>
            ) : (
              <Stack spacing={0}>{pendingEvents.map((item) => renderEventCard(item, "pending"))}</Stack>
            )
          ) : (
            assignedEvents.length === 0 ? (
              <Alert severity="info" sx={{ borderRadius: 2 }}>Todavía no hay reuniones asignadas.</Alert>
            ) : (
              <Stack spacing={0}>{assignedEvents.map((item) => renderEventCard(item, "assigned"))}</Stack>
            )
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
