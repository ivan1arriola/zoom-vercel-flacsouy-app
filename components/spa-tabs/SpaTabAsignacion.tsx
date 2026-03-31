"use client";

import { useMemo } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { formatDuration } from "@/src/lib/spa-home/recurrence";
import { formatModalidad, formatZoomDateTime } from "./spa-tabs-utils";
import type { AssignmentBoardEvent, AssignableAssistant } from "@/src/services/dashboardApi";

interface SpaTabAsignacionProps {
  assignmentBoardEvents: AssignmentBoardEvent[];
  assignableAssistants: AssignableAssistant[];
  isLoadingAssignmentBoard: boolean;
  assigningEventId: string | null;
  selectedAssistantByEvent: Record<string, string>;
  onSelectedAssistantChange: (eventId: string, assistantId: string) => void;
  onAssignAssistant: (eventId: string) => void;
}

export function SpaTabAsignacion({
  assignmentBoardEvents,
  assignableAssistants,
  isLoadingAssignmentBoard,
  assigningEventId,
  selectedAssistantByEvent,
  onSelectedAssistantChange,
  onAssignAssistant
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

    return (
      <Paper
        key={item.id}
        variant="outlined"
        sx={{
          p: 1.5,
          borderRadius: 2,
          borderLeft: `5px solid ${isPending ? "#ed6c02" : "#0288d1"}`
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
        >
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {item.solicitud.titulo}
            </Typography>
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
              <Chip size="small" variant="outlined" label={formatModalidad(item.modalidadReunion)} />
              <Chip size="small" variant="outlined" label={formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)} />
              <Chip
                size="small"
                color={currentAssignment ? "info" : "warning"}
                label={currentAssignment ? "Con asistencia Zoom" : "Sin asistencia Zoom"}
              />
              {currentAssignment ? (
                <Chip
                  size="small"
                  color="success"
                  label={`Asignada a ${currentAssignment.nombre}`}
                />
              ) : null}
            </Stack>
          </Box>
          <Button
            size="small"
            variant="contained"
            onClick={() => onAssignAssistant(item.id)}
            disabled={assigningEventId === item.id || !selectedAssistantId || isNoopSelection}
          >
            {assigningEventId === item.id
              ? isReassignment
                ? "Reasignando..."
                : "Asignando..."
              : isReassignment
                ? "Reasignar"
                : "Asignar"}
          </Button>
        </Stack>

        <Box
          sx={{
            mt: 1.2,
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(3, minmax(0, 1fr))"
            },
            gap: 1
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary">
              Dia y hora
            </Typography>
            <Typography variant="body2">
              {formatZoomDateTime(item.inicioProgramadoAt)} a {formatZoomDateTime(item.finProgramadoAt)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Cuenta Zoom
            </Typography>
            <Typography variant="body2">{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || "-"}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Programa
            </Typography>
            <Typography variant="body2">{item.solicitud.programaNombre || "-"}</Typography>
          </Box>
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
            <Typography variant="caption" color="text.secondary">
              Asistencia actual
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: currentAssignment ? 700 : 400 }}>
              {currentAssignment
                ? `${currentAssignment.nombre} (${currentAssignment.email})`
                : "Sin asignar"}
            </Typography>
          </Box>
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
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
        </Box>
      </Paper>
    );
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Asignacion de personal
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Vista exclusiva para administracion: instancias futuras con y sin monitoreo asignado.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          La asignacion/reasignacion valida choques de horario y exige un margen minimo de 30 minutos entre reuniones.
        </Typography>

        {isLoadingAssignmentBoard ? (
          <Typography variant="body2" color="text.secondary">
            Cargando panel de asignacion...
          </Typography>
        ) : assignmentBoardEvents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay instancias futuras pendientes de asignacion/reasignacion.
          </Typography>
        ) : (
          <Stack spacing={1.6}>
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
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Total reuniones
                </Typography>
                <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                  {sortedEvents.length}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Sin asistencia Zoom
                </Typography>
                <Typography variant="h6" sx={{ lineHeight: 1.1, color: "warning.main" }}>
                  {pendingEvents.length}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Ya asignadas
                </Typography>
                <Typography variant="h6" sx={{ lineHeight: 1.1, color: "info.main" }}>
                  {assignedEvents.length}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.2 }}>
                <Typography variant="caption" color="text.secondary">
                  Personas asignadas
                </Typography>
                <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                  {assignedByAssistant.length}
                </Typography>
              </Paper>
            </Box>

            <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.8 }}>
                Resumen por persona
              </Typography>
              {assignedByAssistant.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Todavia no hay reuniones asignadas.
                </Typography>
              ) : (
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                  {assignedByAssistant.map((assistant) => (
                    <Chip
                      key={assistant.asistenteZoomId}
                      size="small"
                      variant="outlined"
                      label={`${assistant.nombre}: ${assistant.events.length}`}
                    />
                  ))}
                </Stack>
              )}
            </Paper>

            <Stack spacing={1}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Reuniones sin asistencia Zoom ({pendingEvents.length})
              </Typography>
              {pendingEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay reuniones pendientes de asignacion.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {pendingEvents.map((item) => renderEventCard(item, "pending"))}
                </Stack>
              )}
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Reuniones asignadas ({assignedEvents.length})
              </Typography>
              {assignedEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No hay reuniones asignadas actualmente.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {assignedEvents.map((item) => renderEventCard(item, "assigned"))}
                </Stack>
              )}
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
