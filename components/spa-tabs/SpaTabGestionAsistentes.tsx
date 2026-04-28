"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
  Skeleton,
  Button,
  Avatar,
  IconButton,
  Tooltip,
  Tabs,
  Tab
} from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import PaymentsIcon from "@mui/icons-material/Payments";
import EventNoteIcon from "@mui/icons-material/EventNote";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LaunchIcon from "@mui/icons-material/Launch";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import BarChartIcon from "@mui/icons-material/BarChart";
import GroupIcon from "@mui/icons-material/Group";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

import { 
  loadPersonHours, 
  type PersonHoursMeeting, 
  type PersonHoursPerson, 
  type PersonHoursResponse 
} from "@/src/services/tarifasApi";
import { 
  AssignmentBoardEvent, 
  AssignableAssistant, 
  AssignmentSuggestion 
} from "@/src/services/dashboardApi";
import { formatHours, formatCurrency, formatZoomDate, formatZoomTime } from "./spa-tabs-utils";
import { SpaTabAsignacion } from "./SpaTabAsignacion";

interface SpaTabGestionAsistentesProps {
  // Navigation
  activeSubTab?: number;
  onTabChange?: (tabIndex: number) => void;
  // Asignacion Props
  assignmentBoardEvents: AssignmentBoardEvent[];
  assignableAssistants: AssignableAssistant[];
  isLoadingAssignmentBoard: boolean;
  assignmentSuggestion: AssignmentSuggestion | null;
  isLoadingSuggestion: boolean;
  hasSuggestionSession: boolean;
  assigningEventId: string | null;
  removingAssistanceEventId: string | null;
  selectedAssistantByEvent: Record<string, string>;
  onSelectedAssistantChange: (eventId: string, assistantId: string) => void;
  onAssignAssistant: (eventId: string) => void;
  onRemoveAssistanceForEvent: (input: {
    eventoId: string;
    solicitudId: string;
    titulo: string;
    inicioProgramadoAt: string;
  }) => void;
  onSuggestMonthly: () => void;
  onSuggestNext: () => void;
  // Other
  onDownloadReport: () => void;
}

export function SpaTabGestionAsistentes(props: SpaTabGestionAsistentesProps) {
  const activeSubTab = props.activeSubTab ?? 0;
  
  // Per-assistant detail state
  const [people, setPeople] = useState<PersonHoursPerson[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonHoursResponse | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Stats calculation
  const totalMonthlyExecuted = useMemo(() => {
    // This would ideally come from an aggregate API, but we can compute from people if available
    return 0; // Placeholder for now
  }, [people]);

  useEffect(() => {
    (async () => {
      setIsLoadingList(true);
      try {
        const data = await loadPersonHours();
        if (data) {
          const assistants = (data.people ?? []).filter(p => p.hasAssistantProfile);
          setPeople(assistants.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
          if (assistants.length > 0 && !selectedUserId) {
            setSelectedUserId(assistants[0].userId);
          }
        }
      } catch (err) {
        console.error("Error loading assistants list", err);
      } finally {
        setIsLoadingList(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    (async () => {
      setIsLoadingDetail(true);
      try {
        const data = await loadPersonHours(selectedUserId);
        setDetail(data);
      } finally {
        setIsLoadingDetail(false);
      }
    })();
  }, [selectedUserId]);

  const selectedPerson = useMemo(() => 
    people.find(p => p.userId === selectedUserId), 
    [people, selectedUserId]
  );

  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const prevMonthSummary = useMemo(() => 
    detail?.monthSummaries?.find(s => s.monthKey === prevMonthKey),
    [detail, prevMonthKey]
  );

  const currentMonthSummary = useMemo(() => 
    detail?.monthSummaries?.find(s => s.monthKey === currentMonthKey),
    [detail, currentMonthKey]
  );

  const meetingsGroups = useMemo(() => {
    if (!detail?.meetings) return { pastMonth: [], currentPast: [], currentFuture: [], futureMonths: [] };
    
    const nowTime = now.getTime();
    const pastMonth: PersonHoursMeeting[] = [];
    const currentPast: PersonHoursMeeting[] = [];
    const currentFuture: PersonHoursMeeting[] = [];
    const futureMonths: PersonHoursMeeting[] = [];

    detail.meetings.forEach(m => {
      const time = new Date(m.inicioAt).getTime();
      const monthKey = `${new Date(m.inicioAt).getFullYear()}-${String(new Date(m.inicioAt).getMonth() + 1).padStart(2, "0")}`;

      if (monthKey === prevMonthKey) {
        pastMonth.push(m);
      } else if (monthKey === currentMonthKey) {
        if (time < nowTime) {
          currentPast.push(m);
        } else {
          currentFuture.push(m);
        }
      } else if (monthKey > currentMonthKey) {
        futureMonths.push(m);
      }
    });

    // Sort chronologically (oldest first)
    const sortByTime = (a: PersonHoursMeeting, b: PersonHoursMeeting) => new Date(a.inicioAt).getTime() - new Date(b.inicioAt).getTime();

    return {
      pastMonth: pastMonth.sort(sortByTime),
      currentPast: currentPast.sort(sortByTime),
      currentFuture: currentFuture.sort(sortByTime),
      futureMonths: futureMonths.sort(sortByTime)
    };
  }, [detail, prevMonthKey, currentMonthKey, now]);

  return (
    <Box sx={{ width: "100%", height: "100%" }}>
      <Box sx={{ mt: 0 }}>
        {activeSubTab === 0 && (
          <SpaTabAsignacion 
            assignmentBoardEvents={props.assignmentBoardEvents}
            assignableAssistants={props.assignableAssistants}
            isLoadingAssignmentBoard={props.isLoadingAssignmentBoard}
            assignmentSuggestion={props.assignmentSuggestion}
            isLoadingSuggestion={props.isLoadingSuggestion}
            hasSuggestionSession={props.hasSuggestionSession}
            assigningEventId={props.assigningEventId}
            removingAssistanceEventId={props.removingAssistanceEventId}
            selectedAssistantByEvent={props.selectedAssistantByEvent}
            onSelectedAssistantChange={props.onSelectedAssistantChange}
            onAssignAssistant={props.onAssignAssistant}
            onRemoveAssistanceForEvent={props.onRemoveAssistanceForEvent}
            onSuggestMonthly={props.onSuggestMonthly}
            onSuggestNext={props.onSuggestNext}
          />
        )}

        {activeSubTab === 1 && (
          <Grid container spacing={2.5} sx={{ height: "calc(100vh - 180px)", minHeight: 600 }}>
            <Grid size={{ xs: 12, md: 3.5, lg: 3 }} sx={{ display: { xs: selectedUserId ? "none" : "block", md: "block" } }}>
              <Paper 
                variant="outlined" 
                sx={{ 
                  height: "100%", 
                  display: "flex", 
                  flexDirection: "column",
                  borderRadius: 3,
                  overflow: "hidden"
                }}
              >
                <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                    Asistentes
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Selecciona un perfil para ver detalles
                  </Typography>
                </Box>
                <List sx={{ flexGrow: 1, overflowY: "auto", py: 0 }}>
                  {isLoadingList ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <ListItem key={i} divider>
                        <Skeleton variant="circular" width={40} height={40} sx={{ mr: 2 }} />
                        <Skeleton variant="text" width="70%" />
                      </ListItem>
                    ))
                  ) : (
                    people.map((person) => (
                      <ListItemButton 
                        key={person.userId} 
                        selected={selectedUserId === person.userId}
                        onClick={() => setSelectedUserId(person.userId)}
                        divider
                        sx={{
                          py: 1.5,
                          "&.Mui-selected": {
                            bgcolor: "primary.lighter",
                            borderRight: "4px solid",
                            borderRightColor: "primary.main"
                          }
                        }}
                      >
                        <Avatar sx={{ mr: 1.5, bgcolor: selectedUserId === person.userId ? "primary.main" : "grey.300" }}>
                          {person.nombre[0]}
                        </Avatar>
                        <ListItemText 
                          primary={person.nombre} 
                          secondary={person.email}
                          primaryTypographyProps={{ variant: "body2", fontWeight: 700 }}
                          secondaryTypographyProps={{ variant: "caption" }}
                        />
                        <ChevronRightIcon fontSize="small" color="disabled" />
                      </ListItemButton>
                    ))
                  )}
                </List>
                <Box sx={{ p: 2, bgcolor: "grey.50" }}>
                  <Button 
                    fullWidth 
                    variant="outlined" 
                    startIcon={<CloudDownloadIcon />}
                    onClick={props.onDownloadReport}
                    sx={{ borderRadius: 2 }}
                  >
                    Informe de Contaduría
                  </Button>
                </Box>
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 8.5, lg: 9 }} sx={{ display: { xs: selectedUserId ? "block" : "none", md: "block" } }}>
              <Box sx={{ height: "100%", overflowY: "auto", pr: 0.5 }}>
                {!selectedUserId ? (
                  <Stack alignItems="center" justifyContent="center" sx={{ height: "100%", opacity: 0.6 }}>
                    <SupportAgentIcon sx={{ fontSize: 64, mb: 1.5 }} />
                    <Typography variant="h6">Selecciona un asistente para ver su detalle</Typography>
                  </Stack>
                ) : (
                  <Stack spacing={2.5}>
                    <Card variant="outlined" sx={{ borderRadius: 3, background: "linear-gradient(135deg, #f8faff 0%, #ffffff 100%)" }}>
                      <CardContent sx={{ py: 2.5 }}>
                        <Stack direction="row" spacing={2.5} alignItems="center">
                          <IconButton 
                            onClick={() => setSelectedUserId(null)} 
                            sx={{ display: { xs: "flex", md: "none" }, mr: -1 }}
                          >
                            <ArrowBackIcon />
                          </IconButton>
                          <Avatar sx={{ width: 64, height: 64, bgcolor: "primary.main", fontSize: 24, fontWeight: 700 }}>
                            {selectedPerson?.nombre[0]}
                          </Avatar>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="h5" sx={{ fontWeight: 900 }}>
                              {selectedPerson?.nombre}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {selectedPerson?.email}
                            </Typography>
                          </Box>
                          <Tooltip title="Ir al Tablero de Asignación">
                            <Button 
                              variant="contained" 
                              size="small" 
                              onClick={() => props.onTabChange?.(0)} 
                              sx={{ borderRadius: 2 }}
                            >
                              Ir a Asignación
                            </Button>
                          </Tooltip>
                        </Stack>
                      </CardContent>
                    </Card>

                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Card variant="outlined" sx={{ borderRadius: 3, borderLeft: "6px solid", borderLeftColor: "success.main" }}>
                          <CardContent sx={{ p: 2 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>
                                  A Pagar este mes (Mes anterior)
                                </Typography>
                                <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5, color: "success.dark" }}>
                                  {isLoadingDetail ? <Skeleton width={120} /> : formatCurrency(prevMonthSummary?.estimatedAmount ?? 0)}
                                </Typography>
                              </Box>
                              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: "success.lighter", color: "success.main" }}>
                                <PaymentsIcon />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Card variant="outlined" sx={{ borderRadius: 3, borderLeft: "6px solid", borderLeftColor: "primary.main" }}>
                          <CardContent sx={{ p: 2 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Box>
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase" }}>
                                  Proyectado Próximo Mes (Mes actual)
                                </Typography>
                                <Typography variant="h4" sx={{ fontWeight: 900, mt: 0.5, color: "primary.dark" }}>
                                  {isLoadingDetail ? <Skeleton width={120} /> : formatCurrency(currentMonthSummary?.estimatedAmount ?? 0)}
                                </Typography>
                              </Box>
                              <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: "primary.lighter", color: "primary.main" }}>
                                <ScheduleIcon />
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>

                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.5 }}>
                        Actividad Reciente
                      </Typography>
                      {isLoadingDetail ? (
                        <Stack spacing={1.5}>
                          <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
                          <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
                        </Stack>
                      ) : (
                        <Stack spacing={4}>
                          {[
                            { title: "El Mes Pasado", list: meetingsGroups.pastMonth, color: "success.main" },
                            { title: "Este Mes - Ya ocurridas", list: meetingsGroups.currentPast, color: "primary.main" },
                            { title: "Este Mes - Por ocurrir", list: meetingsGroups.currentFuture, color: "primary.main" },
                            { title: "Próximos Meses", list: meetingsGroups.futureMonths, color: "text.secondary" }
                          ].map((group, idx) => {
                            if (group.list.length === 0) return null;
                            return (
                              <Box key={idx}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1, color: group.color }}>
                                  {group.title} ({group.list.length})
                                </Typography>
                                <Stack spacing={1}>
                                  {group.list.map(m => (
                                    <Paper key={m.assignmentId} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                                      <Grid container spacing={1} alignItems="center">
                                        <Grid size={{ xs: 12, sm: 6 }}>
                                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{m.titulo}</Typography>
                                          <Typography variant="caption" color="text.secondary">{m.programaNombre}</Typography>
                                        </Grid>
                                        <Grid size={{ xs: 6, sm: 3 }}>
                                          <Typography variant="caption" sx={{ fontWeight: 600 }}>{formatZoomDate(m.inicioAt)} - {formatZoomTime(m.inicioAt)}</Typography>
                                          <Typography variant="caption" display="block">{formatHours(m.minutos / 60)} asignadas</Typography>
                                        </Grid>
                                        <Grid size={{ xs: 6, sm: 3 }} sx={{ textAlign: "right" }}>
                                          <Chip label={m.isCompleted ? "Completada" : "Pendiente"} size="small" color={m.isCompleted ? "success" : "warning"} variant="outlined" />
                                        </Grid>
                                      </Grid>
                                    </Paper>
                                  ))}
                                </Stack>
                              </Box>
                            );
                          })}
                        </Stack>
                      )}
                    </Box>
                  </Stack>
                )}
              </Box>
            </Grid>
          </Grid>
        )}

        {activeSubTab === 2 && (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <BarChartIcon sx={{ fontSize: 64, color: "divider", mb: 2 }} />
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>Estadísticas Globales</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 400, mx: "auto", mb: 4 }}>
              Próximamente: Visualiza el desempeño de todo el equipo de asistencia, cobertura de reuniones y reportes de gestión.
            </Typography>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>{people.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Asistentes Activos</Typography>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>98%</Typography>
                  <Typography variant="caption" color="text.secondary">Cobertura del Mes</Typography>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
                  <Typography variant="h4" sx={{ fontWeight: 900 }}>$---</Typography>
                  <Typography variant="caption" color="text.secondary">Total Liquidaciones</Typography>
                </Card>
              </Grid>
            </Grid>
          </Box>
        )}
      </Box>
    </Box>
  );
}
