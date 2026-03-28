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

  const orderedEvents = useMemo(
    () => [...pendingEvents, ...assignedEvents],
    [pendingEvents, assignedEvents]
  );

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
          <Stack spacing={1.2}>
            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
              <Chip size="small" color="warning" label={`Pendientes: ${pendingEvents.length}`} />
              <Chip size="small" color="info" label={`Asignadas: ${assignedEvents.length}`} />
              <Chip size="small" variant="outlined" label={`Total: ${orderedEvents.length}`} />
            </Stack>

            {pendingEvents.length > 0 ? (
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 0.2 }}>
                Pendientes de asignacion
              </Typography>
            ) : null}

            {orderedEvents.map((item, index) => {
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
              const options = Array.from(optionsMap.values());
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
              const isPending = !currentAssignment;
              const isFirstAssignedRow = pendingEvents.length > 0 && index === pendingEvents.length;

              return (
                <Box key={item.id}>
                  {isFirstAssignedRow ? (
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.8 }}>
                      Reuniones ya asignadas
                    </Typography>
                  ) : null}

                <Paper
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
                          label={currentAssignment ? "Con monitoreo" : "Sin monitoreo"}
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
                        Monitoreo actual
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
                </Box>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
