"use client";

import {
  Button,
  Card,
  CardContent,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper
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
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Modalidad</TableCell>
                  <TableCell>Nombre actividad</TableCell>
                  <TableCell>Dia y hora</TableCell>
                  <TableCell>Duracion</TableCell>
                  <TableCell>Cuenta Zoom</TableCell>
                  <TableCell>Programa</TableCell>
                  <TableCell>Interesados</TableCell>
                  <TableCell>Asignar persona</TableCell>
                  <TableCell>Accion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
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

                  return (
                    <TableRow key={item.id} hover>
                      <TableCell>{formatModalidad(item.modalidadReunion)}</TableCell>
                      <TableCell>{item.solicitud.titulo}</TableCell>
                      <TableCell>
                        {formatZoomDateTime(item.inicioProgramadoAt)} a {formatZoomDateTime(item.finProgramadoAt)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)}
                      </TableCell>
                      <TableCell>{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || "-"}</TableCell>
                      <TableCell>{item.solicitud.programaNombre || "-"}</TableCell>
                      <TableCell>
                        {item.interesados.length > 0
                          ? item.interesados.map((interest) => `${interest.nombre} (${interest.email})`).join(", ")
                          : "Sin interesados"}
                      </TableCell>
                      <TableCell sx={{ minWidth: 260 }}>
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
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => onAssignAssistant(item.id)}
                          disabled={assigningEventId === item.id || !selectedAssistantByEvent[item.id]}
                        >
                          {assigningEventId === item.id ? "Asignando..." : "Asignar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
