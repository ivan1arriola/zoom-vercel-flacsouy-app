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
import type { ReactElement } from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  formatModalidad,
  isMeetingStartingSoon,
  getPreparacionDisplay,
  getEncargado,
  normalizeZoomMeetingId,
  resolveZoomJoinUrl,
  formatZoomDate,
  formatZoomTime,
  formatDurationHuman
} from "./spa-tabs-utils";
import type { AgendaEvent } from "@/src/services/agendaApi";
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";

interface SpaTabAgendaLibreProps {
  agendaLibre: AgendaEvent[];
  updatingInterestId: string | null;
  onSetInterest: (eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA") => void;
}

type InterestState = "ME_INTERESA" | "NO_ME_INTERESA" | "SIN_RESPUESTA";

function mapInterestChip(
  currentInterest: InterestState
): { color: "success" | "error" | "warning"; label: string; icon: ReactElement } {
  if (currentInterest === "ME_INTERESA") {
    return { color: "success", label: "Me interesa", icon: <CheckCircleOutlineIcon fontSize="small" /> };
  }
  if (currentInterest === "NO_ME_INTERESA") {
    return { color: "error", label: "No me interesa", icon: <HighlightOffIcon fontSize="small" /> };
  }
  return { color: "warning", label: "Sin respuesta", icon: <HelpOutlineIcon fontSize="small" /> };
}

function resolveInterestState(value?: string | null): InterestState {
  if (value === "ME_INTERESA") return "ME_INTERESA";
  if (value === "NO_ME_INTERESA") return "NO_ME_INTERESA";
  return "SIN_RESPUESTA";
}

function formatInterestAnsweredAt(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function resolveRecurringCount(item: AgendaEvent): number | null {
  const recurrence = item.solicitud.patronRecurrencia;
  if (!recurrence || typeof recurrence !== "object") return null;
  const totalInstancias = recurrence["totalInstancias"];
  if (typeof totalInstancias !== "number" || !Number.isFinite(totalInstancias)) return null;
  const normalized = Math.max(0, Math.floor(totalInstancias));
  return normalized > 1 ? normalized : null;
}

function resolveAssignedAssistantLabel(item: AgendaEvent): string {
  const assigned = item.asignaciones?.[0]?.asistente?.usuario;
  if (!assigned) return "";
  return (
    assigned.name ||
    [assigned.firstName, assigned.lastName].filter(Boolean).join(" ").trim() ||
    assigned.email ||
    ""
  );
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
          Reuniones disponibles
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Vista para asistentes Zoom. Aqui solo se muestran instancias sin persona asignada y listas para tomar.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          Puedes marcar me interesa o no me interesa en cada instancia y cambiar tu respuesta cuando quieras.
        </Typography>

        {agendaLibre.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay eventos abiertos para interes.
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {agendaLibre.map((item) => {
              const joinUrl = resolveZoomJoinUrl(item.zoomJoinUrl, item.zoomMeetingId);
              const meetingId = normalizeZoomMeetingId(item.zoomMeetingId) ?? "-";
              const currentInterest = resolveInterestState(item.intereses[0]?.estadoInteres);
              const interestChip = mapInterestChip(currentInterest);
              const startsSoon = isMeetingStartingSoon(item.inicioProgramadoAt);
              const answeredAt = formatInterestAnsweredAt(item.intereses[0]?.fechaRespuestaAt);
              const recurringCount = resolveRecurringCount(item);
              const hostAccount =
                item.cuentaZoom?.ownerEmail?.trim() ||
                item.cuentaZoom?.nombreCuenta?.trim() ||
                null;
              const assignedPersonLabel = resolveAssignedAssistantLabel(item);

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
                        <Chip size="small" color={interestChip.color} icon={interestChip.icon} label={interestChip.label} />
                        {recurringCount ? (
                          <Chip size="small" color="primary" variant="outlined" label={`${recurringCount} reuniones`} />
                        ) : (
                          <Chip size="small" variant="outlined" label="Reunion unica" />
                        )}
                        {startsSoon ? <Chip size="small" color="warning" label="Comienza en menos de 24h" /> : null}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.6, display: "block" }}>
                        {answeredAt ? `Respuesta registrada: ${answeredAt}` : "Todavia no respondiste esta instancia."}
                      </Typography>
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
                        disabled={updatingInterestId === item.id || currentInterest === "ME_INTERESA"}
                        color="success"
                      >
                        {currentInterest === "NO_ME_INTERESA" ? "Cambiar a me interesa" : "Me interesa"}
                      </Button>
                      <Button
                        size="small"
                        variant={currentInterest === "NO_ME_INTERESA" ? "contained" : "outlined"}
                        onClick={() => onSetInterest(item.id, "NO_ME_INTERESA")}
                        disabled={updatingInterestId === item.id || currentInterest === "NO_ME_INTERESA"}
                        color="error"
                      >
                        {currentInterest === "ME_INTERESA" ? "Cambiar a no me interesa" : "No me interesa"}
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
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {formatZoomDate(item.inicioProgramadoAt)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {formatZoomTime(item.inicioProgramadoAt)} a {formatZoomTime(item.finProgramadoAt)} (
                        {formatDurationHuman(item.inicioProgramadoAt, item.finProgramadoAt)})
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
                        Cuenta streaming asociada
                      </Typography>
                      <Typography variant="body2">{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || "-"}</Typography>
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
                        Asistente por reunion
                      </Typography>
                      <MeetingAssistantStatusChip
                        requiresAssistance
                        assistantName={assignedPersonLabel}
                        pendingLabel="Pendiente"
                      />
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
                    <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
                      <ZoomAccountPasswordField
                        hostAccount={hostAccount}
                        label="Contrasena cuenta streaming"
                      />
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
