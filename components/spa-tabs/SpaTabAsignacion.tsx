"use client";

import { useMemo } from "react";
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
  Typography
} from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import AssignmentLateRoundedIcon from "@mui/icons-material/AssignmentLateRounded";
import AssignmentTurnedInRoundedIcon from "@mui/icons-material/AssignmentTurnedInRounded";
import GroupRoundedIcon from "@mui/icons-material/GroupRounded";
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
  selectedAssistantByEvent: Record<string, string>;
  onSelectedAssistantChange: (eventId: string, assistantId: string) => void;
  onAssignAssistant: (eventId: string) => void;
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
  selectedAssistantByEvent,
  onSelectedAssistantChange,
  onAssignAssistant,
  onSuggestMonthly,
  onSuggestNext
}: SpaTabAsignacionProps) {
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
    const interestedIds = new Set(item.interesados.map((interest) => interest.asistenteZoomId));
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

    for (const assistant of assignableAssistants) {
      if (!optionsMap.has(assistant.id) && !interestedIds.has(assistant.id)) {
        optionsMap.set(assistant.id, {
          id: assistant.id,
          label: `${assistant.nombre} (${assistant.email})`
        });
      }
    }

    return Array.from(optionsMap.values());
  }

  function renderEventCard(item: AssignmentBoardEvent, section: "pending" | "assigned") {
    const currentAssignment = item.currentAssignment ?? null;
    const options = buildOptionsForEvent(item);
    const selectedAssistantId = selectedAssistantByEvent[item.id] ?? "";
    const isReassignment =
      Boolean(currentAssignment) &&
      Boolean(selectedAssistantId) &&
      selectedAssistantId !== currentAssignment?.asistenteZoomId;
    const isNoopSelection =
      Boolean(currentAssignment) &&
      selectedAssistantId === currentAssignment?.asistenteZoomId;
    const interestedLabel =
      item.interesados.length > 0
        ? item.interesados.map((interest) => `${interest.nombre} (${interest.email})`).join(", ")
        : "Sin interesados";
    const isPending = section === "pending";
    const actionDisabled = assigningEventId === item.id || !selectedAssistantId || isNoopSelection;
    const actionHelper = !selectedAssistantId
      ? "Selecciona una persona para habilitar la asignacion."
      : isNoopSelection
        ? "La persona elegida ya esta asignada a esta reunion."
        : "Confirma para guardar la asignacion.";
    const statusLabel = currentAssignment ? "Asignada" : "Pendiente";
    const statusColor = currentAssignment ? "success" : "warning";
    const meetingId = normalizeZoomMeetingId(item.zoomMeetingId) ?? "-";
    const recurringCount = meetingId === "-" ? 1 : recurrenceCountByMeetingId.get(meetingId) ?? 1;
    const hostAccount =
      item.cuentaZoom?.ownerEmail?.trim() ||
      item.cuentaZoom?.nombreCuenta?.trim() ||
      null;

    return (
      <Paper
        key={item.id}
        variant="outlined"
        sx={{
          p: { xs: 1.2, sm: 1.5 },
          borderRadius: 2.5,
          borderColor: isPending ? "warning.main" : "info.main",
          backgroundColor: isPending ? "rgba(237, 108, 2, 0.04)" : "rgba(2, 136, 209, 0.04)"
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {item.solicitud.titulo}
            </Typography>
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
              <Chip
                size="small"
                color={statusColor}
                label={statusLabel}
              />
              <Chip size="small" variant="outlined" label={formatModalidad(item.modalidadReunion)} />
              <Chip size="small" variant="outlined" label={formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)} />
              {currentAssignment ? (
                <Chip
                  size="small"
                  color="info"
                  variant="outlined"
                  label={`Actual: ${currentAssignment.nombre}`}
                />
              ) : null}
            </Stack>
          </Box>
        </Stack>

        <Box
          sx={{
            mt: 1.2,
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              lg: "1.35fr 1fr"
            },
            gap: 1.1
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Typography variant="overline" color="text.secondary">
              Detalle de la reunion
            </Typography>
            <Stack spacing={0.8} sx={{ mt: 0.2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Dia y hora
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatZoomDate(item.inicioProgramadoAt)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatZoomTime(item.inicioProgramadoAt)} a {formatZoomTime(item.finProgramadoAt)} (
                  {formatDurationHuman(item.inicioProgramadoAt, item.finProgramadoAt)})
                </Typography>
              </Box>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Cuenta streaming asociada
                </Typography>
                <Typography variant="body2">
                  {item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || "-"}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  ID de reunion
                </Typography>
                <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                  {meetingId}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Cantidad de reuniones
                </Typography>
                <Typography variant="body2">
                  {recurringCount} {recurringCount === 1 ? "instancia" : "instancias"}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Asistente por reunion
                </Typography>
                <MeetingAssistantStatusChip
                  requiresAssistance
                  assistantName={currentAssignment?.nombre ?? null}
                  assistantEmail={currentAssignment?.email ?? null}
                  pendingLabel="Pendiente"
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Programa
                </Typography>
                <Typography variant="body2">{item.solicitud.programaNombre || "-"}</Typography>
              </Box>
              <ZoomAccountPasswordField
                hostAccount={hostAccount}
                label="Contrasena cuenta streaming"
              />
            </Stack>
          </Paper>

          <Paper
            variant="outlined"
            sx={{
              p: 1.2,
              borderRadius: 2,
              borderColor: currentAssignment ? "info.main" : "warning.main",
              backgroundColor: currentAssignment ? "rgba(2, 136, 209, 0.05)" : "rgba(237, 108, 2, 0.06)"
            }}
          >
            <Typography variant="overline" color="text.secondary">
              Asignacion
            </Typography>
            <Stack spacing={0.8} sx={{ mt: 0.2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Persona actual
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: currentAssignment ? 700 : 400 }}>
                  {currentAssignment
                    ? `${currentAssignment.nombre} (${currentAssignment.email})`
                    : "Sin asignar"}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Interesados
                </Typography>
                <Typography variant="body2">{interestedLabel}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Asignar persona
                </Typography>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={selectedAssistantByEvent[item.id] ?? ""}
                  onChange={(e) => onSelectedAssistantChange(item.id, e.target.value)}
                >
                  <MenuItem value="">Seleccionar</MenuItem>
                  {options.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              <Button
                size="small"
                variant="contained"
                onClick={() => onAssignAssistant(item.id)}
                disabled={actionDisabled}
              >
                {assigningEventId === item.id
                  ? isReassignment
                    ? "Reasignando..."
                    : "Asignando..."
                  : isReassignment
                    ? "Confirmar reasignacion"
                    : "Confirmar asignacion"}
              </Button>
              <Typography variant="caption" color={actionDisabled ? "text.secondary" : "success.main"}>
                {actionHelper}
              </Typography>
            </Stack>
          </Paper>
        </Box>
      </Paper>
    );
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3.5 }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.4 }}>
          Asignacion de personal
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Vista exclusiva para administracion: instancias futuras con y sin monitoreo asignado.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          La asignacion/reasignacion valida choques de horario y exige un margen minimo de 30 minutos entre reuniones.
        </Typography>

        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          Prioriza primero el bloque <strong>Reuniones sin asistencia Zoom</strong>. Las reasignaciones se usan para balancear carga.
        </Alert>

        <Paper
          variant="outlined"
          sx={{
            p: 1.2,
            borderRadius: 2.5,
            mb: 2,
            borderColor: "primary.main",
            backgroundColor: "rgba(31, 75, 143, 0.05)"
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.8} alignItems="center">
                <AutoAwesomeRoundedIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Sugerencias automaticas
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                Genera una propuesta inicial y luego itera alternativas para comparar equilibrio por mes y tarifa.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                size="small"
                variant="contained"
                onClick={onSuggestMonthly}
                disabled={isLoadingSuggestion}
                startIcon={<AutoAwesomeRoundedIcon fontSize="small" />}
              >
                {isLoadingSuggestion ? "Calculando..." : "Generar sugerencia"}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={onSuggestNext}
                disabled={isLoadingSuggestion || !hasSuggestionSession}
              >
                Otra sugerencia
              </Button>
            </Stack>
          </Stack>

          {assignmentSuggestion ? (
            <Box sx={{ mt: 1.2 }}>
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`Puntaje sugerencia: ${assignmentSuggestion.score.toFixed(2)}`}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
                La propuesta fue precargada en cada selector para que confirmes manualmente reunion por reunion.
              </Typography>
            </Box>
          ) : null}
        </Paper>

        {isLoadingAssignmentBoard ? (
          <Typography variant="body2" color="text.secondary">
            Cargando panel de asignacion...
          </Typography>
        ) : assignmentBoardEvents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay instancias futuras pendientes de asignacion/reasignacion.
          </Typography>
        ) : (
          <Stack spacing={1.8}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(4, minmax(0, 1fr))"
                },
                gap: 1
              }}
            >
              {[
                {
                  key: "total",
                  label: "Total reuniones",
                  value: sortedEvents.length,
                  icon: <EventNoteRoundedIcon fontSize="small" color="primary" />,
                  tone: "text.primary"
                },
                {
                  key: "pending",
                  label: "Sin asistencia Zoom",
                  value: pendingEvents.length,
                  icon: <AssignmentLateRoundedIcon fontSize="small" color="warning" />,
                  tone: "warning.main"
                },
                {
                  key: "assigned",
                  label: "Ya asignadas",
                  value: assignedEvents.length,
                  icon: <AssignmentTurnedInRoundedIcon fontSize="small" color="info" />,
                  tone: "info.main"
                },
                {
                  key: "people",
                  label: "Personas asignadas",
                  value: assignedByAssistant.length,
                  icon: <GroupRoundedIcon fontSize="small" color="action" />,
                  tone: "text.primary"
                }
              ].map((metric) => (
                <Paper
                  key={metric.key}
                  variant="outlined"
                  sx={{ p: 1.2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.75)" }}
                >
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    {metric.icon}
                    <Typography variant="caption" color="text.secondary">
                      {metric.label}
                    </Typography>
                  </Stack>
                  <Typography variant="h6" sx={{ lineHeight: 1.1, color: metric.tone, mt: 0.4 }}>
                    {metric.value}
                  </Typography>
                </Paper>
              ))}
            </Box>

            <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.8 }}>
                Resumen por persona
              </Typography>
              {assignedByAssistant.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Todavia no hay reuniones asignadas.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, minmax(0, 1fr))",
                      lg: "repeat(3, minmax(0, 1fr))"
                    },
                    gap: 1
                  }}
                >
                  {assignedByAssistant.map((assistant) => (
                    <Paper
                      key={assistant.asistenteZoomId}
                      variant="outlined"
                      sx={{ p: 1, borderRadius: 1.8 }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {assistant.nombre}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {assistant.email}
                      </Typography>
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ mt: 0.8 }}
                        label={`${assistant.events.length} reunion(es)`}
                      />
                    </Paper>
                  ))}
                </Box>
              )}
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 1.2,
                borderRadius: 2.5,
                borderColor: "warning.main",
                backgroundColor: "rgba(237, 108, 2, 0.03)"
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={0.8}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Reuniones sin asistencia Zoom ({pendingEvents.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Prioridad operativa: estas reuniones requieren asignacion.
                  </Typography>
                </Box>
                <Chip color="warning" label={`Pendientes: ${pendingEvents.length}`} />
              </Stack>

              {pendingEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No hay reuniones pendientes de asignacion.
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {pendingEvents.map((item) => renderEventCard(item, "pending"))}
                </Stack>
              )}
            </Paper>

            <Paper
              variant="outlined"
              sx={{
                p: 1.2,
                borderRadius: 2.5,
                borderColor: "info.main",
                backgroundColor: "rgba(2, 136, 209, 0.03)"
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={0.8}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
              >
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Reuniones asignadas ({assignedEvents.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Mantenimiento: puedes reasignar si necesitas balancear la carga.
                  </Typography>
                </Box>
                <Chip color="info" label={`Asignadas: ${assignedEvents.length}`} />
              </Stack>

              {assignedEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No hay reuniones asignadas actualmente.
                </Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {assignedEvents.map((item) => renderEventCard(item, "assigned"))}
                </Stack>
              )}
            </Paper>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
