"use client";

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
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Asignacion de personal
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Vista exclusiva para administracion: instancias abiertas, personas interesadas y asignacion final.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          La asignacion valida choques de horario y exige un margen minimo de 30 minutos entre reuniones.
        </Typography>

        {isLoadingAssignmentBoard ? (
          <Typography variant="body2" color="text.secondary">
            Cargando panel de asignacion...
          </Typography>
        ) : assignmentBoardEvents.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay instancias pendientes de asignacion.
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {assignmentBoardEvents.map((item) => {
              const interestedIds = new Set(item.interesados.map((interest) => interest.asistenteZoomId));
              const options = [
                ...item.interesados.map((interest) => ({
                  id: interest.asistenteZoomId,
                  label: `${interest.nombre} (${interest.email})`
                })),
                ...assignableAssistants
                  .filter((assistant) => !interestedIds.has(assistant.id))
                  .map((assistant) => ({
                    id: assistant.id,
                    label: `${assistant.nombre} (${assistant.email})`
                  }))
              ];
              const interestedLabel =
                item.interesados.length > 0
                  ? item.interesados.map((interest) => `${interest.nombre} (${interest.email})`).join(", ")
                  : "Sin interesados";

              return (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
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
                      </Stack>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => onAssignAssistant(item.id)}
                      disabled={assigningEventId === item.id || !selectedAssistantByEvent[item.id]}
                    >
                      {assigningEventId === item.id ? "Asignando..." : "Asignar"}
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
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
