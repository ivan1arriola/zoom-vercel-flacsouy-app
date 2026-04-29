"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Typography,
  Tabs,
  Tab,
  Divider,
  useTheme,
  alpha
} from "@mui/material";
import { useEffect, useState, useMemo, type ReactElement } from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import EventIcon from "@mui/icons-material/Event";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PersonIcon from "@mui/icons-material/Person";
import LayersIcon from "@mui/icons-material/Layers";
import BusinessIcon from "@mui/icons-material/Business";

import {
  formatModalidad,
  isMeetingStartingSoon,
  getEncargado,
  formatZoomDate,
  formatZoomTime
} from "./spa-tabs-utils";
import { markAgendaViewed, type AgendaEvent } from "@/src/services/agendaApi";

interface SpaTabAgendaLibreProps {
  agendaLibre: AgendaEvent[];
  updatingInterestId: string | null;
  onSetInterest: (eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA" | "RETIRADO") => void;
}

type InterestState = "ME_INTERESA" | "NO_ME_INTERESA" | "RETIRADO" | "SIN_RESPUESTA";

function resolveInterestState(value?: string | null): InterestState {
  if (value === "ME_INTERESA") return "ME_INTERESA";
  if (value === "RETIRADO") return "RETIRADO";
  if (value === "NO_ME_INTERESA") return "NO_ME_INTERESA";
  return "SIN_RESPUESTA";
}

function formatDuration(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const diffMs = e.getTime() - s.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function getMonthYear(dateIso: string): string {
  const date = new Date(dateIso);
  return date.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
}

export function SpaTabAgendaLibre({
  agendaLibre,
  updatingInterestId,
  onSetInterest
}: SpaTabAgendaLibreProps) {
  const theme = useTheme();
  const [subTab, setSubTab] = useState(0);

  useEffect(() => {
    void markAgendaViewed();
  }, []);

  const filteredEvents = useMemo(() => {
    return agendaLibre.filter((item) => {
      const state = resolveInterestState(item.intereses[0]?.estadoInteres);
      if (subTab === 0) return state === "SIN_RESPUESTA";
      return state !== "SIN_RESPUESTA";
    });
  }, [agendaLibre, subTab]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, AgendaEvent[]> = {};
    filteredEvents.forEach((event) => {
      const key = getMonthYear(event.inicioProgramadoAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    
    // Sort keys chronologically
    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1][0].inicioProgramadoAt);
      const dateB = new Date(b[1][0].inicioProgramadoAt);
      return dateA.getTime() - dateB.getTime();
    });
  }, [filteredEvents]);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, background: "linear-gradient(45deg, #1f4b8f, #4dabf5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Reuniones Disponibles
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Postulate a las reuniones que puedas cubrir. Las reuniones presenciales requieren tu asistencia física en FLACSO.
        </Typography>
      </Box>

      <Tabs 
        value={subTab} 
        onChange={(_, newValue) => setSubTab(newValue)}
        sx={{ 
          mb: 3,
          borderBottom: 1, 
          borderColor: "divider",
          "& .MuiTab-root": {
            textTransform: "none",
            fontWeight: 700,
            fontSize: "1rem",
            minWidth: 160
          }
        }}
      >
        <Tab label={`Pendientes (${agendaLibre.filter(i => resolveInterestState(i.intereses[0]?.estadoInteres) === "SIN_RESPUESTA").length})`} />
        <Tab label={`Respondidas (${agendaLibre.filter(i => resolveInterestState(i.intereses[0]?.estadoInteres) !== "SIN_RESPUESTA").length})`} />
      </Tabs>

      {filteredEvents.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: "center", borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.03), border: "2px dashed", borderColor: alpha(theme.palette.primary.main, 0.1) }}>
          <HelpOutlineIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
          <Typography variant="h6" color="text.secondary" fontWeight={700}>
            {subTab === 0 ? "No hay reuniones pendientes de respuesta." : "Aún no has respondido a ninguna reunión."}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={4}>
          {groupedEvents.map(([monthYear, events]) => (
            <Box key={monthYear}>
              <Divider textAlign="left" sx={{ mb: 3, "&::before, &::after": { borderColor: alpha(theme.palette.primary.main, 0.1) } }}>
                <Chip 
                  label={monthYear.toUpperCase()} 
                  sx={{ 
                    fontWeight: 900, 
                    px: 2, 
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    color: "primary.dark",
                    borderRadius: 2
                  }} 
                />
              </Divider>

              <Stack spacing={2}>
                {events.map((item) => {
                  const state = resolveInterestState(item.intereses[0]?.estadoInteres);
                  const isInterested = state === "ME_INTERESA";
                  const isNotInterested = state === "NO_ME_INTERESA" || state === "RETIRADO";
                  const isPresencial = item.solicitud.modalidadReunion === "PRESENCIAL" || item.solicitud.modalidadReunion === "HIBRIDA";
                  const isRecurrent = !!item.solicitud.patronRecurrencia;
                  
                  return (
                    <Paper
                      key={item.id}
                      variant="outlined"
                      sx={{
                        p: 3,
                        borderRadius: 4,
                        position: "relative",
                        overflow: "hidden",
                        transition: "all 0.2s ease-in-out",
                        borderLeft: "8px solid",
                        borderLeftColor: isInterested ? "success.main" : isPresencial ? "error.main" : "primary.main",
                        "&:hover": {
                          boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                          transform: "translateY(-2px)"
                        },
                        bgcolor: isInterested ? alpha(theme.palette.success.main, 0.02) : "background.paper"
                      }}
                    >
                      {isPresencial && (
                        <Box sx={{ 
                          position: "absolute", 
                          top: 0, 
                          right: 32, 
                          bgcolor: "error.main", 
                          color: "white", 
                          px: 1.5, 
                          pt: 1, 
                          pb: 1.5,
                          fontWeight: 900,
                          fontSize: "0.6rem",
                          clipPath: "polygon(0 0, 100% 0, 100% 100%, 50% 85%, 0 100%)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          zIndex: 10,
                          boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
                          textTransform: "uppercase"
                        }}>
                          <BusinessIcon sx={{ fontSize: 14, mb: 0.2 }} />
                          Presencial
                        </Box>
                      )}

                      <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems="flex-start">
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
                            <Chip 
                              icon={<EventIcon fontSize="small" />}
                              label={formatZoomDate(item.inicioProgramadoAt)}
                              sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.08) }}
                            />
                            <Chip 
                              icon={<ScheduleIcon fontSize="small" />}
                              label={`${formatZoomTime(item.inicioProgramadoAt)} - ${formatZoomTime(item.finProgramadoAt)} (${formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)})`}
                              variant="outlined"
                              sx={{ fontWeight: 700 }}
                            />
                            <Chip 
                              label={formatModalidad(item.solicitud.modalidadReunion)}
                              color={isPresencial ? "error" : "primary"}
                              variant={isPresencial ? "filled" : "outlined"}
                              sx={{ fontWeight: 800 }}
                            />
                            <Chip 
                              icon={<LayersIcon fontSize="small" />}
                              label={isRecurrent ? "Serie Recurrente" : "Reunión Única"}
                              sx={{ fontWeight: 700, fontStyle: isRecurrent ? "italic" : "normal" }}
                            />
                          </Stack>

                          <Typography variant="h5" sx={{ fontWeight: 900, mb: 0.5, color: "text.primary" }}>
                            {item.solicitud.titulo}
                          </Typography>
                          <Typography variant="subtitle1" sx={{ color: "primary.main", fontWeight: 700, mb: 2.5 }}>
                            {item.solicitud.programaNombre || "Sin programa"}
                          </Typography>

                          <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, fontWeight: 700, mb: 0.5 }}>
                                <PersonIcon fontSize="inherit" /> PERSONA A CARGO
                              </Typography>
                              <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                {getEncargado(item) || item.solicitud.responsableNombre || "No definido"}
                              </Typography>
                            </Box>
                          </Stack>
                        </Box>

                        <Box sx={{ 
                          width: { xs: "100%", md: 240 }, 
                          display: "flex", 
                          flexDirection: "column", 
                          gap: 1.5,
                          pt: { xs: 2, md: 0 },
                          borderTop: { xs: 1, md: 0 },
                          borderColor: "divider"
                        }}>
                          {subTab === 1 && (
                            <Box sx={{ mb: 1, p: 1.5, borderRadius: 2, bgcolor: alpha(isInterested ? theme.palette.success.main : theme.palette.error.main, 0.08), textAlign: "center" }}>
                              <Typography variant="caption" sx={{ fontWeight: 800, color: isInterested ? "success.dark" : "error.dark", display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                                {isInterested ? <CheckCircleOutlineIcon fontSize="inherit" /> : <HighlightOffIcon fontSize="inherit" />}
                                {isInterested ? "ESTÁS POSTULADO" : "NO POSTULADO"}
                              </Typography>
                            </Box>
                          )}

                          <Button
                            fullWidth
                            variant={isInterested ? "outlined" : "contained"}
                            color="success"
                            size="large"
                            onClick={() => onSetInterest(item.id, "ME_INTERESA")}
                            disabled={updatingInterestId === item.id || isInterested}
                            sx={{ 
                              fontWeight: 900, 
                              py: 1.5,
                              borderRadius: 3,
                              boxShadow: isInterested ? "none" : theme.shadows[4]
                            }}
                          >
                            {isInterested ? "YA POSTULADO" : "¡ME POSTULO!"}
                          </Button>

                          <Button
                            fullWidth
                            variant="text"
                            color="error"
                            size="small"
                            onClick={() => onSetInterest(item.id, "RETIRADO")}
                            disabled={updatingInterestId === item.id || isNotInterested}
                            sx={{ fontWeight: 700, borderRadius: 2 }}
                          >
                            {isInterested ? "RETIRAR MI POSTULACIÓN" : "NO PUEDO ASISTIR"}
                          </Button>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

