"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Skeleton,
  Stack,
  Typography,
  Divider,
  useTheme,
  alpha,
  IconButton,
  Tooltip,
  Paper
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EventIcon from "@mui/icons-material/Event";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PersonIcon from "@mui/icons-material/Person";
import LayersIcon from "@mui/icons-material/Layers";
import BusinessIcon from "@mui/icons-material/Business";
import GoogleIcon from "@mui/icons-material/Google";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import KeyIcon from "@mui/icons-material/Key";
import LinkIcon from "@mui/icons-material/Link";

import {
  loadPersonHours,
  loadZoomAccountPassword,
  type PersonHoursMeeting
} from "@/src/services/tarifasApi";

interface SpaTabMisReunionesAsignadasProps {
  userId: string;
}

type MonthlyUpcomingGroup = {
  monthLabel: string;
  monthKey: string;
  meetings: PersonHoursMeeting[];
};

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

function normalizeZoomMeetingId(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

function resolveMeetingId(meeting: PersonHoursMeeting): string | null {
  return normalizeZoomMeetingId(meeting.zoomMeetingId);
}

function resolveJoinUrl(meeting: PersonHoursMeeting): string | null {
  const explicitJoinUrl = (meeting.zoomJoinUrl ?? "").trim();
  if (explicitJoinUrl) return explicitJoinUrl;
  const meetingId = resolveMeetingId(meeting);
  return meetingId ? `https://zoom.us/j/${meetingId}` : null;
}

function toUtcCalendarStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function buildGoogleCalendarUrl(meeting: PersonHoursMeeting): string {
  const text = meeting.titulo || "Reunión Zoom";
  const start = toUtcCalendarStamp(meeting.inicioProgramadoAt || meeting.inicioAt);
  const end = toUtcCalendarStamp(meeting.finProgramadoAt || meeting.finAt);
  const meetingId = resolveMeetingId(meeting) ?? "-";
  const joinUrl = resolveJoinUrl(meeting);
  
  const details = [
    `Programa: ${meeting.programaNombre || "Sin programa"}`,
    `Meeting ID: ${meetingId}`,
    joinUrl ? `Zoom: ${joinUrl}` : null
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text,
    dates: `${start}/${end}`,
    details,
    location: "Zoom"
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SpaTabMisReunionesAsignadas({ userId }: SpaTabMisReunionesAsignadasProps) {
  const theme = useTheme();
  const [meetings, setMeetings] = useState<PersonHoursMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [passwordLoading, setPasswordLoading] = useState<Record<string, boolean>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copyFeedback, setCopyFeedback] = useState<Record<string, string>>({});

  async function refresh() {
    if (!userId) return;
    setIsLoading(true);
    setError("");
    try {
      const payload = await loadPersonHours(userId);
      if (!payload) {
        setError("No se pudo cargar tus reuniones asignadas.");
        return;
      }
      // Only keep future/uncompleted meetings
      const now = Date.now();
      const future = payload.meetings.filter(m => {
        const endDate = new Date(m.finAt);
        const startMs = new Date(m.inicioAt).getTime();
        // Allow meetings that haven't finished yet
        return !m.isCompleted && endDate.getTime() >= now;
      }).sort((a, b) => new Date(a.inicioAt).getTime() - new Date(b.inicioAt).getTime());
      
      setMeetings(future);
    } catch {
      setError("Error al cargar las reuniones.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [userId]);

  const groupedMeetings = useMemo(() => {
    const groups: Record<string, MonthlyUpcomingGroup> = {};
    meetings.forEach((m) => {
      const key = m.inicioAt.substring(0, 7); // YYYY-MM
      const label = getMonthYear(m.inicioAt);
      if (!groups[key]) groups[key] = { monthKey: key, monthLabel: label, meetings: [] };
      groups[key].meetings.push(m);
    });
    return Object.values(groups).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [meetings]);

  const handleTogglePassword = async (meeting: PersonHoursMeeting) => {
    const account = meeting.zoomHostAccount || meeting.zoomAccountEmail || meeting.zoomAccountName;
    if (!account) return;
    
    const mKey = `${meeting.assignmentId}-${meeting.eventId}`;
    if (showPasswords[mKey]) {
      setShowPasswords(prev => ({ ...prev, [mKey]: false }));
      return;
    }

    setShowPasswords(prev => ({ ...prev, [mKey]: true }));
    if (passwords[account] || passwordLoading[account]) return;

    setPasswordLoading(prev => ({ ...prev, [account]: true }));
    try {
      const res = await loadZoomAccountPassword(account);
      if (res.success && res.password) {
        setPasswords(prev => ({ ...prev, [account]: res.password! }));
      }
    } finally {
      setPasswordLoading(prev => ({ ...prev, [account]: false }));
    }
  };

  const handleCopy = async (text: string, key: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopyFeedback(prev => ({ ...prev, [key]: "¡Copiado!" }));
      setTimeout(() => setCopyFeedback(prev => ({ ...prev, [key]: "" })), 2000);
    }
  };

  return (
    <Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, background: "linear-gradient(45deg, #1f4b8f, #4dabf5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Próximas Reuniones
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Tu agenda de asistencias confirmadas ordenadas por proximidad.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Chip 
            label={`${meetings.length} reuniones pendientes`} 
            color="primary" 
            sx={{ fontWeight: 900, py: 2.5, px: 1, fontSize: "1rem", borderRadius: 3 }} 
          />
          <Button variant="outlined" onClick={() => void refresh()} disabled={isLoading} sx={{ borderRadius: 2, fontWeight: 700 }}>
            Actualizar
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {isLoading && meetings.length === 0 ? (
        <Stack spacing={2}>
          {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={200} sx={{ borderRadius: 4 }} />)}
        </Stack>
      ) : meetings.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: "center", borderRadius: 4, bgcolor: alpha(theme.palette.primary.main, 0.03), border: "2px dashed", borderColor: alpha(theme.palette.primary.main, 0.1) }}>
          <EventIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
          <Typography variant="h6" color="text.secondary" fontWeight={700}>
            No tienes reuniones asignadas próximamente.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={5}>
          {groupedMeetings.map((group) => (
            <Box key={group.monthKey}>
              <Divider textAlign="left" sx={{ mb: 3, "&::before, &::after": { borderColor: alpha(theme.palette.primary.main, 0.1) } }}>
                <Chip 
                  label={group.monthLabel.toUpperCase()} 
                  sx={{ 
                    fontWeight: 900, 
                    px: 2, 
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                    color: "primary.dark",
                    borderRadius: 2
                  }} 
                />
              </Divider>

              <Stack spacing={2.5}>
                {group.meetings.map((m) => {
                  const mKey = `${m.assignmentId}-${m.eventId}`;
                  const isPresencial = m.modalidadReunion === "HIBRIDA";
                  const joinUrl = resolveJoinUrl(m);
                  const host = m.zoomHostAccount || m.zoomAccountEmail || m.zoomAccountName;
                  const password = passwords[host || ""] || "";
                  const isVisible = showPasswords[mKey];
                  const isLoadingPass = host ? passwordLoading[host] : false;

                  return (
                    <Paper
                      key={mKey}
                      variant="outlined"
                      sx={{
                        p: 3,
                        borderRadius: 4,
                        position: "relative",
                        overflow: "hidden",
                        borderLeft: "8px solid",
                        borderLeftColor: isPresencial ? "error.main" : "primary.main",
                        bgcolor: "background.paper",
                        transition: "all 0.2s",
                        "&:hover": { boxShadow: theme.shadows[8] }
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

                      <Stack direction={{ xs: "column", lg: "row" }} spacing={4}>
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} sx={{ mb: 2 }} useFlexGap flexWrap="wrap">
                            <Chip icon={<EventIcon fontSize="small" />} label={new Date(m.inicioAt).toLocaleDateString("es-UY", { weekday: "long", day: "numeric" })} sx={{ fontWeight: 700 }} />
                            <Chip icon={<ScheduleIcon fontSize="small" />} label={`${new Date(m.inicioAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })} - ${new Date(m.finAt).toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false })} (${formatDuration(m.inicioAt, m.finAt)})`} variant="outlined" sx={{ fontWeight: 700 }} />
                            <Chip label={isPresencial ? "Presencial" : "Virtual"} color={isPresencial ? "error" : "primary"} sx={{ fontWeight: 800 }} />
                            <Chip icon={<LayersIcon fontSize="small" />} label={m.solicitudId ? "Serie Recurrente" : "Reunión Única"} sx={{ fontWeight: 700 }} />
                          </Stack>

                          <Typography variant="h5" sx={{ fontWeight: 900, mb: 0.5 }}>{m.titulo}</Typography>
                          <Typography variant="subtitle1" sx={{ color: "primary.main", fontWeight: 700, mb: 3 }}>{m.programaNombre || "Sin programa"}</Typography>

                          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 3, mb: 3 }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, fontWeight: 700, mb: 0.5 }}>
                                <PersonIcon fontSize="inherit" /> PERSONA A CARGO
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.responsableNombre || "No definido"}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, fontWeight: 700, mb: 0.5 }}>
                                <KeyIcon fontSize="inherit" /> MEETING ID
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: "monospace" }}>{resolveMeetingId(m) || "-"}</Typography>
                            </Box>
                          </Box>

                          <Stack spacing={1.5} sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.04), border: "1px solid", borderColor: alpha(theme.palette.primary.main, 0.1) }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <LinkIcon color="primary" fontSize="small" />
                              <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: "break-all" }}>
                                {joinUrl ? (
                                  <a href={joinUrl} target="_blank" rel="noreferrer" style={{ color: theme.palette.primary.main, textDecoration: "none" }}>{joinUrl}</a>
                                ) : "Sin link generado"}
                              </Typography>
                              {joinUrl && (
                                <Tooltip title={copyFeedback[`link-${mKey}`] || "Copiar Link"}>
                                  <IconButton size="small" onClick={() => handleCopy(joinUrl, `link-${mKey}`)}><ContentCopyIcon fontSize="inherit" /></IconButton>
                                </Tooltip>
                              )}
                            </Box>
                            
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>CUENTA HOST</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{host || "-"}</Typography>
                              </Box>
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>CONTRASEÑA</Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: "monospace" }}>
                                    {isVisible ? (password || "...") : "••••••••"}
                                  </Typography>
                                  <IconButton size="small" onClick={() => handleTogglePassword(m)} disabled={isLoadingPass}>
                                    {isLoadingPass ? <CircularProgress size={16} /> : isVisible ? <VisibilityOffIcon fontSize="inherit" /> : <VisibilityIcon fontSize="inherit" />}
                                  </IconButton>
                                  {isVisible && password && (
                                    <IconButton size="small" onClick={() => handleCopy(password, `pass-${mKey}`)}><ContentCopyIcon fontSize="inherit" /></IconButton>
                                  )}
                                </Stack>
                              </Box>
                            </Box>
                          </Stack>
                        </Box>

                        <Box sx={{ width: { xs: "100%", lg: 200 }, display: "flex", flexDirection: "column", gap: 2, justifyContent: "center" }}>
                          <Button
                            fullWidth
                            variant="contained"
                            color="primary"
                            startIcon={<GoogleIcon />}
                            href={buildGoogleCalendarUrl(m)}
                            target="_blank"
                            sx={{ borderRadius: 3, fontWeight: 800, py: 1.5, textTransform: "none" }}
                          >
                            Agendar Google
                          </Button>
                          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", fontWeight: 500 }}>
                            Asegúrate de agendarla para no olvidar el compromiso.
                          </Typography>
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
