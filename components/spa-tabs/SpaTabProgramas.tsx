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
  Typography
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AddCircleOutlineRoundedIcon from "@mui/icons-material/AddCircleOutlineRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
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
}

type ProgramaMeeting = {
  key: string;
  solicitudId: string;
  titulo: string;
  modalidadReunion: string;
  estadoSolicitud: string;
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
  if (estado === "PROVISIONADA") return { label: "Provisionada", color: "success" };
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
  onRefresh
}: SpaTabProgramasProps) {
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
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Programas
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
              Catalogo de programas y reuniones asociadas por solicitud.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<RefreshRoundedIcon />}
            onClick={onRefresh}
            disabled={isRefreshing}
            sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700 }}
          >
            {isRefreshing ? "Actualizando..." : "Actualizar"}
          </Button>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))"
            },
            gap: 1,
            mb: 2
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.1 }}>
            <Typography variant="caption" color="text.secondary">
              Programas totales
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              {programaSummaries.length}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.1 }}>
            <Typography variant="caption" color="text.secondary">
              Programas filtrados
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              {filteredProgramas.length}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.1 }}>
            <Typography variant="caption" color="text.secondary">
              Reuniones asociadas
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              {totalReuniones}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.1 }}>
            <Typography variant="caption" color="text.secondary">
              Reuniones proximas
            </Typography>
            <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
              {totalReunionesProximas}
            </Typography>
          </Paper>
        </Box>

        <Paper variant="outlined" sx={{ p: 1.4, borderRadius: 2.2, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Crear programa
          </Typography>
          <Box
            component="form"
            onSubmit={(event) => {
              void handleCreatePrograma(event);
            }}
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 1fr) auto" },
              gap: 1
            }}
          >
            <TextField
              label="Nombre del programa"
              value={newProgramaNombre}
              onChange={(event) => setNewProgramaNombre(event.target.value)}
              size="small"
            />
            <Button
              type="submit"
              variant="contained"
              disabled={!newProgramaNombre.trim() || isCreatingPrograma}
              startIcon={<AddCircleOutlineRoundedIcon />}
              sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700 }}
            >
              {isCreatingPrograma ? "Creando..." : "Crear programa"}
            </Button>
          </Box>
        </Paper>

        <TextField
          label="Buscar programa"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          size="small"
          fullWidth
          sx={{ mb: 1.6 }}
          placeholder="Ej: posgrado, diplomatura, taller..."
        />

        {filteredProgramas.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay programas para mostrar con el filtro actual.
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {filteredProgramas.map((programa) => {
              const isExpanded = expandedProgramaId === programa.id;
              const visibleMeetings = isExpanded ? programa.meetings : programa.meetings.slice(0, 4);
              const canExpandMeetings = programa.meetings.length > 4;

              return (
                <Paper key={programa.id} variant="outlined" sx={{ p: 1.3, borderRadius: 2.2 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                    sx={{ mb: 1 }}
                  >
                    <Box>
                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                          {programa.nombre}
                        </Typography>
                        {!programa.isCataloged ? (
                          <Chip size="small" variant="outlined" color="warning" label="No catalogado" />
                        ) : null}
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                        Solicitudes: {programa.solicitudesCount} | Reuniones: {programa.reunionesCount} | Proximas:{" "}
                        {programa.reunionesProximasCount}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Proxima: ${programa.nextMeetingAt ? formatZoomDateTime(programa.nextMeetingAt) : "-"}`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Ultima: ${programa.latestMeetingAt ? formatZoomDateTime(programa.latestMeetingAt) : "-"}`}
                      />
                    </Stack>
                  </Stack>

                  {programa.meetings.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Sin reuniones asociadas por ahora.
                    </Typography>
                  ) : (
                    <Stack spacing={0.8}>
                      {visibleMeetings.map((meeting) => {
                        const status = mapSolicitudStatus(meeting.estadoSolicitud);
                        return (
                          <Paper
                            key={meeting.key}
                            variant="outlined"
                            sx={{
                              p: 1,
                              borderRadius: 1.7,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 1,
                              flexWrap: "wrap"
                            }}
                          >
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {meeting.titulo}
                              </Typography>
                              <Stack direction="row" spacing={0.7} useFlexGap flexWrap="wrap" sx={{ mt: 0.45 }}>
                                <Chip size="small" variant="outlined" label={formatZoomDateTime(meeting.startTime)} />
                                <Chip size="small" variant="outlined" label={meeting.modalidadReunion} />
                                <Chip size="small" color={status.color} label={status.label} />
                                {meeting.monitorNombre ? (
                                  <Chip size="small" variant="outlined" color="success" label={`Asistencia: ${meeting.monitorNombre}`} />
                                ) : null}
                              </Stack>
                            </Box>
                            {meeting.joinUrl ? (
                              <Button
                                size="small"
                                variant="text"
                                href={meeting.joinUrl}
                                target="_blank"
                                rel="noreferrer"
                                endIcon={<LaunchRoundedIcon fontSize="small" />}
                                sx={{ textTransform: "none" }}
                              >
                                Abrir
                              </Button>
                            ) : null}
                          </Paper>
                        );
                      })}
                    </Stack>
                  )}

                  {canExpandMeetings ? (
                    <Button
                      size="small"
                      variant="text"
                      sx={{ mt: 0.8, textTransform: "none" }}
                      endIcon={isExpanded ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                      onClick={() =>
                        setExpandedProgramaId((prev) => (prev === programa.id ? null : programa.id))
                      }
                    >
                      {isExpanded ? "Ver menos reuniones" : `Ver todas las reuniones (${programa.meetings.length})`}
                    </Button>
                  ) : null}
                </Paper>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
