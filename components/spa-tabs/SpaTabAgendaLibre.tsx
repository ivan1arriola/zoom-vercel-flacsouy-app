"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography
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

function mapInterestChip(
  currentInterest: string
): { color: "success" | "default" | "warning"; label: string } {
  if (currentInterest === "ME_INTERESA") return { color: "success", label: "Me interesa" };
  if (currentInterest === "NO_ME_INTERESA") return { color: "default", label: "No me interesa" };
  return { color: "warning", label: "Sin respuesta" };
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
          <Stack spacing={1.2}>
            {agendaLibre.map((item) => {
              const joinUrl = resolveZoomJoinUrl(item.zoomJoinUrl, item.zoomMeetingId);
              const currentInterest = item.intereses[0]?.estadoInteres || "SIN_RESPUESTA";
              const interestChip = mapInterestChip(currentInterest);
              const startsSoon = isMeetingStartingSoon(item.inicioProgramadoAt);

              return (
                <Paper
                  key={item.id}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderLeft: "5px solid",
                    borderLeftColor: startsSoon ? "warning.main" : "divider",
                    backgroundColor: startsSoon ? "warning.50" : undefined
                  }}
                >
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {item.solicitud.titulo}
                      </Typography>
                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                        <Chip size="small" variant="outlined" label={formatModalidad(item.solicitud.modalidadReunion)} />
                        <Chip size="small" color={interestChip.color} label={interestChip.label} />
                        {startsSoon ? <Chip size="small" color="warning" label="Comienza en menos de 24h" /> : null}
                      </Stack>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {joinUrl ? (
                        <Button size="small" variant="contained" color="secondary" href={joinUrl} target="_blank" rel="noreferrer">
                          Abrir
                        </Button>
                      ) : null}
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
                        Dia y hora
                      </Typography>
                      <Typography variant="body2">
                        {formatZoomDateTime(item.inicioProgramadoAt)} a {formatZoomDateTime(item.finProgramadoAt)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Duracion
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Preparacion
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {getPreparacionDisplay(item) || "-"}
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
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Encargado
                      </Typography>
                      <Typography variant="body2">{getEncargado(item) || item.solicitud.responsableNombre || "-"}</Typography>
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
