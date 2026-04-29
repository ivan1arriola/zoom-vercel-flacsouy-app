"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
  alpha,
  Grid,
  InputAdornment
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AddCircleOutlineRoundedIcon from "@mui/icons-material/AddCircleOutlineRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import type { Programa } from "@/src/services/programasApi";
import type { Solicitud } from "@/src/services/solicitudesApi";
import { formatZoomDateTime } from "./spa-tabs-utils";

interface SpaTabProgramasProps {
  programas: Programa[];
  solicitudes: Solicitud[];
  isCreatingPrograma: boolean;
  isRefreshing: boolean;
  onCreatePrograma: (nombre: string) => Promise<string | null>;
  onRefresh: () => void;
  role?: string;
}

type ProgramaMeeting = {
  key: string;
  solicitudId: string;
  titulo: string;
  modalidadReunion: string;
  estadoSolicitud: string;
  estadoSolicitudVista: string;
  startTime: string;
  endTime?: string;
  joinUrl?: string | null;
  monitorNombre?: string | null;
};

type ProgramaSummary = {
  id: string;
  nombre: string;
  normalizedName: string;
  isCataloged: boolean;
  solicitudesCount: number;
  reunionesCount: number;
  reunionesProximasCount: number;
  nextMeetingAt: string | null;
  latestMeetingAt: string | null;
  meetings: ProgramaMeeting[];
};

type SolicitudStatusChip = {
  label: string;
  color: "default" | "warning" | "success" | "error" | "info";
};

type ProgramaAccumulator = {
  id: string;
  nombre: string;
  normalizedName: string;
  isCataloged: boolean;
  meetings: ProgramaMeeting[];
  solicitudIds: Set<string>;
  meetingKeys: Set<string>;
};

function normalizeProgramName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDateMs(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSolicitudStatus(estado: string): SolicitudStatusChip {
  if (estado === "PROVISIONADA") return { label: "LISTO", color: "success" };
  if (estado === "PENDIENTE_ASISTENCIA_ZOOM") return { label: "PENDIENTE_ASISTENCIA_ZOOM", color: "warning" };
  if (estado === "PROVISIONANDO") return { label: "Provisionando", color: "info" };
  if (estado === "PENDIENTE_RESOLUCION_MANUAL_ID") return { label: "Pendiente manual", color: "warning" };
  if (estado === "SIN_CAPACIDAD_ZOOM") return { label: "Sin capacidad Zoom", color: "error" };
  if (estado === "CANCELADA_ADMIN") return { label: "Cancelada admin", color: "error" };
  if (estado === "CANCELADA_DOCENTE") return { label: "Cancelada docente", color: "error" };
  if (estado === "REGISTRADA") return { label: "Registrada", color: "default" };
  return { label: estado, color: "default" };
}

function buildProgramaSummaries(programas: Programa[], solicitudes: Solicitud[]): ProgramaSummary[] {
  const byProgram = new Map<string, ProgramaAccumulator>();

  for (const programa of programas) {
    const normalizedName = normalizeProgramName(programa.nombre);
    if (!normalizedName) continue;
    byProgram.set(normalizedName, {
      id: programa.id,
      nombre: programa.nombre,
      normalizedName,
      isCataloged: true,
      meetings: [],
      solicitudIds: new Set<string>(),
      meetingKeys: new Set<string>()
    });
  }

  for (const solicitud of solicitudes) {
    const normalizedName = normalizeProgramName(solicitud.programaNombre);
    if (!normalizedName) continue;

    let current = byProgram.get(normalizedName);
    if (!current) {
      const fallbackName = solicitud.programaNombre?.trim() || "Programa sin catalogar";
      current = {
        id: `legacy-${normalizedName}`,
        nombre: fallbackName,
        normalizedName,
        isCataloged: false,
        meetings: [],
        solicitudIds: new Set<string>(),
        meetingKeys: new Set<string>()
      };
      byProgram.set(normalizedName, current);
    }

    current.solicitudIds.add(solicitud.id);
    const instances = solicitud.zoomInstances ?? [];
    for (const instance of instances) {
      const meetingKey = `${solicitud.id}:${instance.eventId ?? instance.occurrenceId ?? instance.startTime}`;
      if (current.meetingKeys.has(meetingKey)) continue;
      current.meetingKeys.add(meetingKey);

      current.meetings.push({
        key: meetingKey,
        solicitudId: solicitud.id,
        titulo: solicitud.titulo,
        modalidadReunion: solicitud.modalidadReunion,
        estadoSolicitud: solicitud.estadoSolicitud,
        estadoSolicitudVista: solicitud.estadoSolicitudVista ?? solicitud.estadoSolicitud,
        startTime: instance.startTime,
        endTime: instance.endTime,
        joinUrl: instance.joinUrl ?? solicitud.zoomJoinUrl ?? null,
        monitorNombre: instance.monitorNombre ?? null
      });
    }
  }

  const nowMs = Date.now();

  return Array.from(byProgram.values())
    .map((item) => {
      const sortedAsc = [...item.meetings].sort(
        (left, right) => normalizeDateMs(left.startTime) - normalizeDateMs(right.startTime)
      );
      const upcoming = sortedAsc.filter((meeting) => normalizeDateMs(meeting.startTime) >= nowMs);
      const past = sortedAsc.filter((meeting) => normalizeDateMs(meeting.startTime) < nowMs).reverse();
      const meetings = [...upcoming, ...past];
      const nextMeetingAt = upcoming[0]?.startTime ?? null;
      const latestMeetingAt = sortedAsc[sortedAsc.length - 1]?.startTime ?? null;

      return {
        id: item.id,
        nombre: item.nombre,
        normalizedName: item.normalizedName,
        isCataloged: item.isCataloged,
        solicitudesCount: item.solicitudIds.size,
        reunionesCount: item.meetings.length,
        reunionesProximasCount: upcoming.length,
        nextMeetingAt,
        latestMeetingAt,
        meetings
      };
    })
    .sort((left, right) => left.nombre.localeCompare(right.nombre, "es"));
}

export function SpaTabProgramas({
  programas,
  solicitudes,
  isCreatingPrograma,
  isRefreshing,
  onCreatePrograma,
  onRefresh,
  role
}: SpaTabProgramasProps) {
  const theme = useTheme();
  const isDocente = role === "DOCENTE";
  const [newProgramaNombre, setNewProgramaNombre] = useState("");
  const [searchText, setSearchText] = useState("");
  const [expandedProgramaId, setExpandedProgramaId] = useState<string | null>(null);

  const programaSummaries = useMemo(
    () => buildProgramaSummaries(programas, solicitudes),
    [programas, solicitudes]
  );

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredProgramas = useMemo(
    () =>
      normalizedSearch
        ? programaSummaries.filter((programa) => programa.normalizedName.includes(normalizedSearch))
        : programaSummaries,
    [programaSummaries, normalizedSearch]
  );

  const totalReuniones = useMemo(
    () => programaSummaries.reduce((acc, item) => acc + item.reunionesCount, 0),
    [programaSummaries]
  );

  const totalReunionesProximas = useMemo(
    () => programaSummaries.reduce((acc, item) => acc + item.reunionesProximasCount, 0),
    [programaSummaries]
  );

  async function handleCreatePrograma(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = newProgramaNombre.trim();
    if (!normalized || isCreatingPrograma) return;

    const createdProgram = await onCreatePrograma(normalized);
    if (createdProgram) {
      setNewProgramaNombre("");
    }
  }

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        sx={{ mb: 4 }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: "primary.main", letterSpacing: "-1px" }}>
            {isDocente ? "Catálogo de Programas" : "Gestión de Programas"}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {isDocente 
              ? "Explora la oferta académica y las reuniones programadas para cada programa." 
              : "Administración integral de la oferta académica y sus sesiones vinculadas."}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshRoundedIcon />}
          onClick={onRefresh}
          disabled={isRefreshing}
          sx={{ 
            textTransform: "none", 
            borderRadius: 2.5, 
            fontWeight: 700, 
            px: 3,
            borderWidth: 2,
            "&:hover": { borderWidth: 2 }
          }}
        >
          {isRefreshing ? "Actualizando..." : "Actualizar"}
        </Button>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.primary.main, 0.03), border: "1px solid", borderColor: alpha(theme.palette.primary.main, 0.1) }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <SchoolRoundedIcon color="primary" />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Programas</Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>{programaSummaries.length}</Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.info.main, 0.03), border: "1px solid", borderColor: alpha(theme.palette.info.main, 0.1) }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <GroupsRoundedIcon color="info" />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Activos</Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>{filteredProgramas.length}</Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.success.main, 0.03), border: "1px solid", borderColor: alpha(theme.palette.success.main, 0.1) }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <EventRepeatRoundedIcon color="success" />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Sesiones</Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>{totalReuniones}</Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.warning.main, 0.03), border: "1px solid", borderColor: alpha(theme.palette.warning.main, 0.1) }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CalendarMonthRoundedIcon color="warning" />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>Próximas</Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>{totalReunionesProximas}</Typography>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {!isDocente && (
        <Paper 
          variant="outlined" 
          sx={{ 
            p: 2.5, 
            borderRadius: 4, 
            mb: 4, 
            bgcolor: alpha(theme.palette.primary.main, 0.02),
            border: "1px dashed",
            borderColor: "primary.main"
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <AddCircleOutlineRoundedIcon color="primary" /> Crear nuevo programa
          </Typography>
          <Box
            component="form"
            onSubmit={(event) => {
              void handleCreatePrograma(event);
            }}
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) auto" },
              gap: 2
            }}
          >
            <TextField
              label="Nombre del programa académico"
              value={newProgramaNombre}
              onChange={(event) => setNewProgramaNombre(event.target.value)}
              size="medium"
              placeholder="Ej: Posgrado en Educación, Sociedad y Política"
              fullWidth
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!newProgramaNombre.trim() || isCreatingPrograma}
              sx={{ textTransform: "none", borderRadius: 3, fontWeight: 700, px: 4 }}
            >
              {isCreatingPrograma ? "Procesando..." : "Registrar programa"}
            </Button>
          </Box>
        </Paper>
      )}

      <Box sx={{ position: "relative", mb: 3 }}>
        <TextField
          placeholder="Buscar programa por nombre..."
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon color="action" />
              </InputAdornment>
            ),
            sx: { borderRadius: 3, bgcolor: "background.paper" }
          }}
        />
      </Box>

      {filteredProgramas.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: "center", borderRadius: 4, bgcolor: alpha(theme.palette.action.disabledBackground, 0.05) }}>
          <Typography variant="h6" color="text.secondary">
            No se encontraron programas que coincidan con tu búsqueda.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2.5}>
          {filteredProgramas.map((programa) => {
            const isExpanded = expandedProgramaId === programa.id;
            const visibleMeetings = isExpanded ? programa.meetings : programa.meetings.slice(0, 4);
            const canExpandMeetings = programa.meetings.length > 4;

            return (
              <Grid size={{ xs: 12 }} key={programa.id}>
                <Card 
                  variant="outlined" 
                  sx={{ 
                    borderRadius: 4, 
                    transition: "all 0.2s",
                    "&:hover": { borderColor: "primary.main", boxShadow: "0 8px 24px rgba(0,0,0,0.05)" }
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={2}
                      alignItems={{ xs: "flex-start", md: "center" }}
                      justifyContent="space-between"
                      sx={{ mb: 2.5 }}
                    >
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Typography variant="h6" sx={{ fontWeight: 800 }}>
                            {programa.nombre}
                          </Typography>
                          {!programa.isCataloged && (
                            <Chip size="small" variant="filled" color="warning" label="Sin catalogar" sx={{ fontWeight: 800, fontSize: "0.65rem" }} />
                          )}
                        </Stack>
                        <Stack direction="row" spacing={2} color="text.secondary">
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            <b>{programa.solicitudesCount}</b> Solicitudes
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            <b>{programa.reunionesCount}</b> Reuniones
                          </Typography>
                          <Typography variant="caption" sx={{ fontWeight: 600, color: "warning.dark" }}>
                            <b>{programa.reunionesProximasCount}</b> Próximas
                          </Typography>
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: "grey.50" }}>
                          <Typography variant="caption" display="block" sx={{ fontWeight: 800, color: "text.disabled", fontSize: "0.6rem" }}>PRÓXIMA</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>{programa.nextMeetingAt ? formatZoomDateTime(programa.nextMeetingAt) : "-"}</Typography>
                        </Paper>
                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: "grey.50" }}>
                          <Typography variant="caption" display="block" sx={{ fontWeight: 800, color: "text.disabled", fontSize: "0.6rem" }}>ÚLTIMA</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>{programa.latestMeetingAt ? formatZoomDateTime(programa.latestMeetingAt) : "-"}</Typography>
                        </Paper>
                      </Stack>
                    </Stack>

                    {programa.meetings.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        Sin reuniones asociadas por ahora.
                      </Typography>
                    ) : (
                      <Stack spacing={1}>
                        {visibleMeetings.map((meeting) => {
                          const status = mapSolicitudStatus(meeting.estadoSolicitudVista);
                          return (
                            <Paper
                              key={meeting.key}
                              variant="outlined"
                              sx={{
                                p: 1.5,
                                borderRadius: 3,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 2,
                                bgcolor: alpha(theme.palette.background.default, 0.5),
                                "&:hover": { bgcolor: "background.default" }
                              }}
                            >
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                                  {meeting.titulo}
                                </Typography>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                  <Typography variant="caption" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}>
                                    <CalendarMonthRoundedIcon sx={{ fontSize: 14 }} /> {formatZoomDateTime(meeting.startTime)}
                                  </Typography>
                                  <Chip size="small" variant="outlined" label={meeting.modalidadReunion} sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }} />
                                  <Chip size="small" color={status.color} label={status.label} sx={{ height: 20, fontSize: "0.65rem", fontWeight: 800 }} />
                                  {meeting.monitorNombre && (
                                    <Chip size="small" variant="filled" color="success" label={meeting.monitorNombre} sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }} />
                                  )}
                                </Stack>
                              </Box>
                              {meeting.joinUrl && (
                                <Button
                                  size="small"
                                  variant="contained"
                                  href={meeting.joinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  endIcon={<LaunchRoundedIcon fontSize="small" />}
                                  sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700 }}
                                >
                                  Unirse
                                </Button>
                              )}
                            </Paper>
                          );
                        })}
                      </Stack>
                    )}

                    {canExpandMeetings && (
                      <Button
                        fullWidth
                        size="small"
                        variant="text"
                        sx={{ mt: 1.5, textTransform: "none", borderRadius: 2, fontWeight: 700, color: "text.secondary" }}
                        endIcon={isExpanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                        onClick={() =>
                          setExpandedProgramaId((prev) => (prev === programa.id ? null : programa.id))
                        }
                      >
                        {isExpanded ? "Contraer lista" : `Mostrar todas las sesiones (${programa.meetings.length})`}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
