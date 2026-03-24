"use client";

import {
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper
} from "@mui/material";
import { formatDuration } from "@/src/lib/spa-home/recurrence";
import {
  formatModalidad,
  isMeetingStartingSoon,
  getPreparacionDisplay,
  getEncargado,
  resolveZoomJoinUrl,
  formatZoomDateTime
} from "./spa-tabs-utils";
import type { AgendaEvent } from "@/src/services/agendaApi";

interface SpaTabAgendaLibreProps {
  agendaLibre: AgendaEvent[];
  updatingInterestId: string | null;
  onSetInterest: (eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA") => void;
}

export function SpaTabAgendaLibre({
  agendaLibre,
  updatingInterestId,
  onSetInterest
}: SpaTabAgendaLibreProps) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Agenda libre
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Vista para asistentes Zoom. Aqui solo se muestran instancias sin persona asignada.
        </Typography>

        {agendaLibre.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay eventos abiertos para interes.
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
                  <TableCell>Preparacion</TableCell>
                  <TableCell>Cuenta Zoom</TableCell>
                  <TableCell>Programa</TableCell>
                  <TableCell>Encargado</TableCell>
                  <TableCell>Link</TableCell>
                  <TableCell>Interes</TableCell>
                  <TableCell>Accion</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agendaLibre.map((item) => {
                  const joinUrl = resolveZoomJoinUrl(item.zoomJoinUrl, item.zoomMeetingId);
                  const currentInterest = item.intereses[0]?.estadoInteres || "SIN_RESPUESTA";

                  return (
                    <TableRow
                      key={item.id}
                      hover
                      sx={isMeetingStartingSoon(item.inicioProgramadoAt) ? { backgroundColor: "warning.50" } : undefined}
                    >
                      <TableCell>{formatModalidad(item.solicitud.modalidadReunion)}</TableCell>
                      <TableCell>{item.solicitud.titulo}</TableCell>
                      <TableCell>
                        {formatZoomDateTime(item.inicioProgramadoAt)} a {formatZoomDateTime(item.finProgramadoAt)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>
                        {formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace" }}>{getPreparacionDisplay(item)}</TableCell>
                      <TableCell>{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || ""}</TableCell>
                      <TableCell>{item.solicitud.programaNombre || ""}</TableCell>
                      <TableCell>{getEncargado(item) || item.solicitud.responsableNombre || ""}</TableCell>
                      <TableCell>
                        {joinUrl ? (
                          <Button size="small" variant="contained" color="secondary" href={joinUrl} target="_blank" rel="noreferrer">
                            Abrir
                          </Button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={currentInterest === "ME_INTERESA" ? "success" : currentInterest === "NO_ME_INTERESA" ? "default" : "warning"}
                          label={currentInterest}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant={currentInterest === "ME_INTERESA" ? "contained" : "outlined"}
                            onClick={() => onSetInterest(item.id, "ME_INTERESA")}
                            disabled={updatingInterestId === item.id}
                          >
                            Me interesa
                          </Button>
                          <Button
                            size="small"
                            variant={currentInterest === "NO_ME_INTERESA" ? "contained" : "outlined"}
                            onClick={() => onSetInterest(item.id, "NO_ME_INTERESA")}
                            disabled={updatingInterestId === item.id}
                          >
                            No me interesa
                          </Button>
                        </Stack>
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
