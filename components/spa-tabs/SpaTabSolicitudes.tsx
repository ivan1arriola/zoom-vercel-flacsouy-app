"use client";

import { FormEvent, useMemo, useState } from "react";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LaunchIcon from "@mui/icons-material/Launch";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EventBusyOutlinedIcon from "@mui/icons-material/EventBusyOutlined";
import CancelScheduleSendOutlinedIcon from "@mui/icons-material/CancelScheduleSendOutlined";
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { ToggleButtons } from "@/components/toggle-buttons";
import {
  buildRecurringStarts,
  formatDateTime,
  getZoomWeekday,
  parseWeekdaysCsv,
  zoomMonthlyWeekOptions,
  type ZoomMonthlyMode,
  type ZoomRecurrenceType
} from "@/src/lib/spa-home/recurrence";
import type { SolicitudFormState } from "@/src/lib/spa-home/solicitud-form";
import type { Solicitud } from "@/src/services/solicitudesApi";

interface SpaTabSolicitudesProps {
  solicitudes: Solicitud[];
  form: SolicitudFormState;
  updateForm: <K extends keyof SolicitudFormState>(key: K, value: SolicitudFormState[K]) => void;
  onDeleteSolicitud: (solicitudId: string) => void;
  deletingSolicitudId: string | null;
  onCancelSolicitudSerie: (solicitudId: string, titulo: string) => void;
  cancellingSerieSolicitudId: string | null;
  onCancelSolicitudInstancia: (input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    occurrenceId?: string | null;
    startTime: string;
  }) => void;
  cancellingInstanciaKey: string | null;
  canDeleteSolicitud: boolean;
  isSubmittingSolicitud: boolean;
  canCreateShortcut: boolean;
  canDelegateResponsable: boolean;
  responsableOptions: Array<{ value: string; label: string }>;
  programaOptions: string[];
  isCreatingPrograma: boolean;
  onCreatePrograma: (nombre: string) => Promise<string | null>;
  docenteSolicitudesView: "form" | "list";
  setDocenteSolicitudesView: (view: "form" | "list") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const CREATE_PROGRAMA_VALUE = "__create_programa__";

const zoomWeekdayOptionsFull: Array<{ value: string; label: string }> = [
  { value: "1", label: "Domingo" },
  { value: "2", label: "Lunes" },
  { value: "3", label: "Martes" },
  { value: "4", label: "Miercoles" },
  { value: "5", label: "Jueves" },
  { value: "6", label: "Viernes" },
  { value: "7", label: "Sabado" }
];

const ZOOM_ACCOUNT_COLOR_PALETTE = [
  "#0D9488",
  "#0284C7",
  "#2563EB",
  "#1D4ED8",
  "#0F766E",
  "#15803D",
  "#65A30D",
  "#CA8A04",
  "#EA580C",
  "#DC2626",
  "#BE185D",
  "#C2410C",
  "#6D28D9",
  "#5B21B6",
  "#334155",
  "#4D7C0F",
  "#0369A1",
  "#7C2D12",
  "#9F1239",
  "#166534"
];

function hashLabel(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getZoomAccountColor(accountLabel: string): string {
  const normalized = accountLabel.trim().toLowerCase();
  if (!normalized || normalized === "-") {
    return "#64748B";
  }
  const paletteIndex = hashLabel(normalized) % ZOOM_ACCOUNT_COLOR_PALETTE.length;
  return ZOOM_ACCOUNT_COLOR_PALETTE[paletteIndex];
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDurationToMinutes(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function minutesToTime(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) return "";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeEmailInputAsLines(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[;,]+/g, "\n")
    .replace(/\n[ \t]+/g, "\n");
}

export function SpaTabSolicitudes({
  solicitudes,
  form,
  updateForm,
  onDeleteSolicitud,
  deletingSolicitudId,
  onCancelSolicitudSerie,
  cancellingSerieSolicitudId,
  onCancelSolicitudInstancia,
  cancellingInstanciaKey,
  canDeleteSolicitud,
  isSubmittingSolicitud,
  canCreateShortcut,
  canDelegateResponsable,
  responsableOptions,
  programaOptions,
  isCreatingPrograma,
  onCreatePrograma,
  docenteSolicitudesView,
  setDocenteSolicitudesView,
  onSubmit
}: SpaTabSolicitudesProps) {
  const [expandedSolicitudId, setExpandedSolicitudId] = useState<string | null>(null);
  const [createProgramaOpen, setCreateProgramaOpen] = useState(false);
  const [newProgramaNombre, setNewProgramaNombre] = useState("");

  function syncDurationFromTimes(startTime: string, endTime: string): string {
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      return "";
    }
    return String(endMinutes - startMinutes);
  }

  function syncEndFromDuration(startTime: string, durationText: string): string {
    const startMinutes = parseTimeToMinutes(startTime);
    const durationMinutes = parseDurationToMinutes(durationText);
    if (startMinutes === null || durationMinutes === null) {
      return "";
    }
    return minutesToTime(startMinutes + durationMinutes);
  }

  function handleUniqueStartChange(nextStart: string) {
    updateForm("horaInicioUnica", nextStart);
    if (form.duracionUnica.trim()) {
      updateForm("horaFinUnica", syncEndFromDuration(nextStart, form.duracionUnica));
      return;
    }
    if (form.horaFinUnica.trim()) {
      updateForm("duracionUnica", syncDurationFromTimes(nextStart, form.horaFinUnica));
    }
  }

  function handleUniqueEndChange(nextEnd: string) {
    updateForm("horaFinUnica", nextEnd);
    updateForm("duracionUnica", syncDurationFromTimes(form.horaInicioUnica, nextEnd));
  }

  function handleUniqueDurationChange(nextDuration: string) {
    updateForm("duracionUnica", nextDuration);
    updateForm("horaFinUnica", syncEndFromDuration(form.horaInicioUnica, nextDuration));
  }

  function handleRecurringStartChange(nextStart: string) {
    updateForm("horaInicioRecurrente", nextStart);
    if (form.duracionRecurrente.trim()) {
      updateForm("horaFinRecurrente", syncEndFromDuration(nextStart, form.duracionRecurrente));
      return;
    }
    if (form.horaFinRecurrente.trim()) {
      updateForm("duracionRecurrente", syncDurationFromTimes(nextStart, form.horaFinRecurrente));
    }
  }

  function handleRecurringEndChange(nextEnd: string) {
    updateForm("horaFinRecurrente", nextEnd);
    updateForm("duracionRecurrente", syncDurationFromTimes(form.horaInicioRecurrente, nextEnd));
  }

  function handleRecurringDurationChange(nextDuration: string) {
    updateForm("duracionRecurrente", nextDuration);
    updateForm("horaFinRecurrente", syncEndFromDuration(form.horaInicioRecurrente, nextDuration));
  }

  const recurrencePreview = useMemo(() => {
    if (form.unaOVarias !== "VARIAS") {
      return { dates: [] as Date[], error: "" };
    }

    if (!form.primerDiaRecurrente || !form.horaInicioRecurrente || !form.fechaFinal) {
      return { dates: [] as Date[], error: "" };
    }

    const firstAnchorDate = new Date(`${form.primerDiaRecurrente}T${form.horaInicioRecurrente}`);
    if (Number.isNaN(firstAnchorDate.getTime())) {
      return { dates: [] as Date[], error: "Primer dia u hora de comienzo invalido." };
    }

    const recurrenceEnd = new Date(`${form.fechaFinal}T${form.horaInicioRecurrente}`);
    if (Number.isNaN(recurrenceEnd.getTime())) {
      return { dates: [] as Date[], error: "Fecha final invalida." };
    }

    if (recurrenceEnd <= firstAnchorDate) {
      return { dates: [] as Date[], error: "La fecha final debe ser posterior a la primera fecha." };
    }

    const recurrenceType = form.recurrenciaTipoZoom as ZoomRecurrenceType;
    if (!["1", "2", "3"].includes(recurrenceType)) {
      return { dates: [] as Date[], error: "Tipo de recurrencia invalido." };
    }

    const repeatInterval = Number(form.recurrenciaIntervalo);
    if (!Number.isInteger(repeatInterval) || repeatInterval < 1) {
      return { dates: [] as Date[], error: "Intervalo de recurrencia invalido." };
    }

    const weeklyDays = parseWeekdaysCsv(form.recurrenciaDiasSemana);
    if (recurrenceType === "2" && weeklyDays.length === 0) {
      return { dates: [] as Date[], error: "Selecciona al menos un dia de la semana." };
    }

    const weeklyDaysForRule =
      recurrenceType === "2"
        ? [...new Set([...weeklyDays, getZoomWeekday(firstAnchorDate)])].sort((a, b) => a - b)
        : [];

    const monthlyMode = form.recurrenciaMensualModo as ZoomMonthlyMode;
    if (!["DAY_OF_MONTH", "WEEKDAY_OF_MONTH"].includes(monthlyMode)) {
      return { dates: [] as Date[], error: "Modo mensual invalido." };
    }

    const monthlyDay = Number(form.recurrenciaDiaMes);
    if (
      recurrenceType === "3" &&
      monthlyMode === "DAY_OF_MONTH" &&
      (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31)
    ) {
      return { dates: [] as Date[], error: "Dia del mes invalido (1 a 31)." };
    }

    const monthlyWeek = Number(form.recurrenciaSemanaMes) as -1 | 1 | 2 | 3 | 4;
    if (recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH" && ![-1, 1, 2, 3, 4].includes(monthlyWeek)) {
      return { dates: [] as Date[], error: "Semana del mes invalida." };
    }

    const monthlyWeekDay = Number(form.recurrenciaDiaSemanaMes);
    if (
      recurrenceType === "3" &&
      monthlyMode === "WEEKDAY_OF_MONTH" &&
      (!Number.isInteger(monthlyWeekDay) || monthlyWeekDay < 1 || monthlyWeekDay > 7)
    ) {
      return { dates: [] as Date[], error: "Dia de semana mensual invalido." };
    }

    const dates = buildRecurringStarts({
      firstStart: firstAnchorDate,
      recurrenceEnd,
      recurrenceType,
      repeatInterval,
      weeklyDays: weeklyDaysForRule,
      monthlyMode,
      monthlyDay,
      monthlyWeek,
      monthlyWeekDay
    });

    if (dates.length === 0) {
      return { dates: [] as Date[], error: "Con esta configuracion no se generan fechas." };
    }

    if (dates.length > 50) {
      return {
        dates: dates.slice(0, 50),
        error: "Zoom permite como maximo 50 ocurrencias. Ajusta fecha final o intervalo."
      };
    }

    return { dates, error: "" };
  }, [
    form.unaOVarias,
    form.primerDiaRecurrente,
    form.horaInicioRecurrente,
    form.fechaFinal,
    form.recurrenciaTipoZoom,
    form.recurrenciaIntervalo,
    form.recurrenciaDiasSemana,
    form.recurrenciaMensualModo,
    form.recurrenciaDiaMes,
    form.recurrenciaSemanaMes,
    form.recurrenciaDiaSemanaMes
  ]);

  function mapSolicitudStatus(estado: string): { label: string; color: "default" | "warning" | "success" | "error" | "info" } {
    if (estado === "PROVISIONADA") return { label: "Provisionada", color: "success" };
    if (estado === "PROVISIONANDO") return { label: "Provisionando", color: "info" };
    if (estado === "PENDIENTE_RESOLUCION_MANUAL_ID") return { label: "Pendiente manual", color: "warning" };
    if (estado === "SIN_CAPACIDAD_ZOOM") return { label: "Sin capacidad Zoom", color: "error" };
    if (estado === "CANCELADA_ADMIN") return { label: "Cancelada admin", color: "error" };
    if (estado === "CANCELADA_DOCENTE") return { label: "Cancelada docente", color: "error" };
    if (estado === "REGISTRADA") return { label: "Registrada", color: "default" };
    return { label: estado, color: "default" };
  }

  const statusSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of solicitudes) {
      counts.set(item.estadoSolicitud, (counts.get(item.estadoSolicitud) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([estado, count]) => ({
        estado,
        count,
        ...mapSolicitudStatus(estado)
      }))
      .sort((left, right) => right.count - left.count);
  }, [solicitudes]);

  function mapInstanciaStatus(
    estadoEvento: string | null | undefined,
    zoomStatus: string | null | undefined
  ): { label: string; color: "default" | "warning" | "success" | "error" | "info"; cancellable: boolean } {
    if (estadoEvento === "CANCELADO" || zoomStatus === "deleted") {
      return { label: "Cancelada", color: "error", cancellable: false };
    }
    if (estadoEvento === "FINALIZADO") {
      return { label: "Finalizada", color: "default", cancellable: false };
    }
    if (estadoEvento === "PROGRAMADO" || estadoEvento === "CREADO_ZOOM") {
      return { label: "Programada", color: "success", cancellable: true };
    }
    if (zoomStatus === "available") {
      return { label: "Disponible", color: "success", cancellable: true };
    }
    return { label: "Activa", color: "info", cancellable: true };
  }

  function renderInstanceList(
    item: Solicitud,
    instances: NonNullable<Solicitud["zoomInstances"]>,
    isSolicitudCancelled: boolean
  ) {
    if (instances.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          Esta solicitud no tiene instancias disponibles.
        </Typography>
      );
    }

    return (
      <Stack spacing={1.2}>
        {instances.map((instance, index) => {
          const status = mapInstanciaStatus(instance.estadoEvento, instance.status);
          const isInstanceCancelled = isSolicitudCancelled || !status.cancellable;
          const instanceKey = `${item.id}:${instance.eventId ?? instance.occurrenceId ?? instance.startTime}`;

          return (
            <Paper
              key={instanceKey}
              variant="outlined"
              sx={{
                p: 1.2,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1
              }}
            >
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {index + 1}. {formatDateTime(instance.startTime)}
                </Typography>
                <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                  <Chip size="small" color={status.color} label={status.label} />
                  {instance.occurrenceId ? (
                    <Chip size="small" variant="outlined" label={`occurrence_id ${instance.occurrenceId}`} />
                  ) : null}
                </Stack>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {instance.joinUrl ? (
                  <Button
                    size="small"
                    variant="text"
                    href={instance.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    endIcon={<LaunchIcon fontSize="small" />}
                  >
                    <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                      Abrir instancia
                    </Box>
                    <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                      Abrir
                    </Box>
                  </Button>
                ) : null}
                {canDeleteSolicitud && (
                  <Button
                    type="button"
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={<EventBusyOutlinedIcon fontSize="small" />}
                    disabled={isInstanceCancelled || cancellingInstanciaKey === instanceKey}
                    onClick={() =>
                      onCancelSolicitudInstancia({
                        solicitudId: item.id,
                        titulo: item.titulo,
                        eventoId: instance.eventId ?? undefined,
                        occurrenceId: instance.occurrenceId ?? undefined,
                        startTime: instance.startTime
                      })
                    }
                  >
                    {cancellingInstanciaKey === instanceKey ? "Cancelando..." : "Cancelar instancia"}
                  </Button>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    );
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            Solicitudes de sala
          </Typography>
          {canCreateShortcut && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                type="button"
                variant={docenteSolicitudesView === "list" ? "contained" : "outlined"}
                onClick={() => setDocenteSolicitudesView("list")}
              >
                Ver solicitudes
              </Button>
              <Button
                type="button"
                variant={docenteSolicitudesView === "form" ? "contained" : "outlined"}
                onClick={() => setDocenteSolicitudesView("form")}
              >
                Nueva solicitud
              </Button>
            </Stack>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Listado de solicitudes con estado, solicitante e informacion de reunion.
        </Typography>

      {canCreateShortcut && docenteSolicitudesView === "form" ? (
        <Box component="form" onSubmit={onSubmit} sx={{ display: "grid", gap: 1.2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.5 }}>
            Seccion 1 de 3 - Datos generales
          </Typography>
          <TextField
            label="Tema"
            required
            fullWidth
            value={form.tema}
            onChange={(e) => updateForm("tema", e.target.value)}
            placeholder="Nombre del Seminario / Clase / Reunion"
            sx={{ mt: 0.2 }}
          />
          {canDelegateResponsable ? (
            <TextField
              label="Persona responsable"
              required
              fullWidth
              select
              value={form.responsable}
              onChange={(e) => updateForm("responsable", e.target.value)}
              helperText="Por defecto es quien hace la peticion. Como admin, puedes delegarla a otro docente o admin."
            >
              {responsableOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
              {form.responsable.trim() &&
                !responsableOptions.some((option) => option.value === form.responsable) && (
                  <MenuItem value={form.responsable}>{form.responsable}</MenuItem>
                )}
            </TextField>
          ) : (
            <TextField
              label="Persona responsable"
              required
              fullWidth
              value={form.responsable}
              onChange={(e) => updateForm("responsable", e.target.value)}
              helperText="Corresponde a quien hace la peticion."
            />
          )}
          <TextField
            label="Programa"
            required
            fullWidth
            select
            value={form.programa}
            disabled={isCreatingPrograma}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (nextValue !== CREATE_PROGRAMA_VALUE) {
                updateForm("programa", nextValue);
                return;
              }

              setNewProgramaNombre("");
              setCreateProgramaOpen(true);
            }}
            helperText={
              programaOptions.length === 0
                ? "No hay programas cargados. Usa la opcion para crear uno."
                : undefined
            }
          >
            {programaOptions.map((programa) => (
              <MenuItem key={programa} value={programa}>
                {programa}
              </MenuItem>
            ))}
            <MenuItem value={CREATE_PROGRAMA_VALUE}>+ Crear programa</MenuItem>
          </TextField>

          <ToggleButtons
            label="Asistencia Zoom"
            value={form.asistenciaZoom}
            onChange={(val) => updateForm("asistenciaZoom", val as SolicitudFormState["asistenciaZoom"])}
          />

          <ToggleButtons
            label="Modalidad"
            name="solicitud-modalidad"
            value={form.modalidad}
            onChange={(val) => updateForm("modalidad", val as SolicitudFormState["modalidad"])}
            options={[
              { value: "VIRTUAL", label: "Virtual" },
              { value: "HIBRIDA", label: "Hibrida" }
            ]}
          />

          <ToggleButtons
            label="Grabacion"
            name="solicitud-grabacion"
            value={form.grabacion}
            onChange={(val) => updateForm("grabacion", val as SolicitudFormState["grabacion"])}
            options={[
              { value: "SI", label: "Si" },
              { value: "NO", label: "No" },
              { value: "DEFINIR", label: "A definir" }
            ]}
          />

          <ToggleButtons
            label="Una o varias reuniones"
            name="solicitud-instancias"
            value={form.unaOVarias}
            onChange={(val) => updateForm("unaOVarias", val as SolicitudFormState["unaOVarias"])}
            options={[
              { value: "UNA", label: "Una sola" },
              { value: "VARIAS", label: "Varias" }
            ]}
          />

          {form.unaOVarias === "UNA" ? (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.8 }}>
                Seccion 2 de 3 - Reunion unica
              </Typography>
              <TextField
                label="Descripcion (opcional)"
                multiline
                minRows={3}
                fullWidth
                value={form.descripcionUnica}
                onChange={(e) => updateForm("descripcionUnica", e.target.value)}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label="Dia de comienzo"
                  type="date"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.diaUnica}
                  onChange={(e) => updateForm("diaUnica", e.target.value)}
                />
                <TextField
                  label="Hora de comienzo"
                  type="time"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaInicioUnica}
                  onChange={(e) => handleUniqueStartChange(e.target.value)}
                />
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label="Hora de fin"
                  type="time"
                  required={!form.duracionUnica}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaFinUnica}
                  onChange={(e) => handleUniqueEndChange(e.target.value)}
                />
                <TextField
                  label="Duracion (minutos)"
                  type="number"
                  required={!form.horaFinUnica}
                  fullWidth
                  inputProps={{ min: 15, step: 15 }}
                  value={form.duracionUnica}
                  onChange={(e) => handleUniqueDurationChange(e.target.value)}
                />
              </Box>
            </>
          ) : (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 0.8 }}>
                Seccion 3 de 3 - Reuniones periodicas
              </Typography>
              <TextField
                label="Descripcion (opcional)"
                multiline
                minRows={3}
                fullWidth
                value={form.descripcionRecurrente}
                onChange={(e) => updateForm("descripcionRecurrente", e.target.value)}
              />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label="Primer dia"
                  type="date"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.primerDiaRecurrente}
                  onChange={(e) => updateForm("primerDiaRecurrente", e.target.value)}
                />
                <TextField
                  label="Hora de comienzo"
                  type="time"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaInicioRecurrente}
                  onChange={(e) => handleRecurringStartChange(e.target.value)}
                />
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 1.2
                }}
              >
                <TextField
                  label="Hora de fin"
                  type="time"
                  required={!form.duracionRecurrente}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  value={form.horaFinRecurrente}
                  onChange={(e) => handleRecurringEndChange(e.target.value)}
                />
                <TextField
                  label="Duracion (minutos)"
                  type="number"
                  required={!form.horaFinRecurrente}
                  fullWidth
                  inputProps={{ min: 15, step: 15 }}
                  value={form.duracionRecurrente}
                  onChange={(e) => handleRecurringDurationChange(e.target.value)}
                />
              </Box>

              <ToggleButtons
                label="Recurrencia (Zoom)"
                name="solicitud-recurrencia-zoom"
                value={form.recurrenciaTipoZoom}
                onChange={(val) => updateForm("recurrenciaTipoZoom", val as ZoomRecurrenceType)}
                options={[
                  { value: "1", label: "Diaria" },
                  { value: "2", label: "Semanal" },
                  { value: "3", label: "Mensual" }
                ]}
              />

              <TextField
                label="Intervalo"
                type="number"
                required
                fullWidth
                inputProps={{
                  min: 1,
                  max: form.recurrenciaTipoZoom === "1" ? 90 : form.recurrenciaTipoZoom === "2" ? 12 : 3,
                  step: 1
                }}
                value={form.recurrenciaIntervalo}
                onChange={(e) => updateForm("recurrenciaIntervalo", e.target.value)}
                helperText={
                  form.recurrenciaTipoZoom === "1"
                    ? "Zoom diario: maximo cada 90 dias."
                    : form.recurrenciaTipoZoom === "2"
                      ? "Zoom semanal: maximo cada 12 semanas."
                      : "Zoom mensual: maximo cada 3 meses."
                }
              />

              {form.recurrenciaTipoZoom === "2" && (
                <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.6 }}>
                    Dias de la semana
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 0.6
                    }}
                  >
                    {zoomWeekdayOptionsFull.map((dayOption) => {
                      const checked = parseWeekdaysCsv(form.recurrenciaDiasSemana).includes(Number(dayOption.value));
                      return (
                        <FormControlLabel
                          key={dayOption.value}
                          control={
                            <Checkbox
                              checked={checked}
                              onChange={(e) => {
                                const current = parseWeekdaysCsv(form.recurrenciaDiasSemana);
                                const value = Number(dayOption.value);
                                const next = e.target.checked
                                  ? [...new Set([...current, value])]
                                  : current.filter((day) => day !== value);
                                updateForm("recurrenciaDiasSemana", next.sort((a, b) => a - b).join(","));
                              }}
                            />
                          }
                          label={dayOption.label}
                        />
                      );
                    })}
                  </Box>
                </Paper>
              )}

              {form.recurrenciaTipoZoom === "3" && (
                <>
                  <ToggleButtons
                    label="Modo mensual"
                    name="solicitud-modo-mensual"
                    value={form.recurrenciaMensualModo}
                    onChange={(val) => updateForm("recurrenciaMensualModo", val as ZoomMonthlyMode)}
                    options={[
                      { value: "DAY_OF_MONTH", label: "Dia del mes" },
                      { value: "WEEKDAY_OF_MONTH", label: "Dia de semana" }
                    ]}
                  />
                  {form.recurrenciaMensualModo === "DAY_OF_MONTH" ? (
                    <TextField
                      label="Dia del mes (1-31)"
                      type="number"
                      required
                      fullWidth
                      inputProps={{ min: 1, max: 31, step: 1 }}
                      value={form.recurrenciaDiaMes}
                      onChange={(e) => updateForm("recurrenciaDiaMes", e.target.value)}
                    />
                  ) : (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: 1.2
                      }}
                    >
                      <TextField
                        label="Semana del mes"
                        select
                        fullWidth
                        value={form.recurrenciaSemanaMes}
                        onChange={(e) => updateForm("recurrenciaSemanaMes", e.target.value)}
                      >
                        {zoomMonthlyWeekOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Dia de semana"
                        select
                        fullWidth
                        value={form.recurrenciaDiaSemanaMes}
                        onChange={(e) => updateForm("recurrenciaDiaSemanaMes", e.target.value)}
                      >
                        {zoomWeekdayOptionsFull.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  )}
                </>
              )}

              <TextField
                label="Fecha final"
                type="date"
                required
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.fechaFinal}
                onChange={(e) => updateForm("fechaFinal", e.target.value)}
              />

              <Paper
                variant="outlined"
                sx={{ mb: 1, p: 1.2, borderRadius: 2, backgroundColor: "grey.50" }}
              >
                <Typography variant="subtitle2">Previsualizacion de fechas</Typography>
                {recurrencePreview.error ? (
                  <Typography variant="body2" color="error.main" sx={{ mt: 0.8 }}>
                    {recurrencePreview.error}
                  </Typography>
                ) : recurrencePreview.dates.length > 0 ? (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8, mb: 0.8 }}>
                      Se crearan {recurrencePreview.dates.length} instancia(s).
                    </Typography>
                    <Box sx={{ display: "grid", gap: 0.5, maxHeight: 220, overflowY: "auto" }}>
                      {recurrencePreview.dates.map((date, index) => (
                        <Typography key={`${date.toISOString()}-${index}`} variant="body2">
                          {index + 1}. {formatDateTime(date.toISOString())}
                        </Typography>
                      ))}
                    </Box>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.8 }}>
                    Completa primer dia, hora de comienzo y fecha final para ver la previsualizacion.
                  </Typography>
                )}
              </Paper>
            </>
          )}

          <TextField
            label="Correos de docentes"
            multiline
            minRows={3}
            fullWidth
            value={form.correosDocentes}
            onChange={(e) => updateForm("correosDocentes", normalizeEmailInputAsLines(e.target.value))}
            placeholder={"docente1@flacso.edu.uy\ndocente2@flacso.edu.uy"}
            helperText="Se enviara una copia del correo de confirmacion cuando la solicitud quede provisionada. Ingresa un email por linea."
            sx={{ mt: 1 }}
          />

          <Button type="submit" variant="contained" disabled={isSubmittingSolicitud}>
            {isSubmittingSolicitud ? "Enviando solicitud..." : "Enviar solicitud"}
          </Button>

          <Dialog
            open={createProgramaOpen}
            onClose={() => {
              if (isCreatingPrograma) return;
              setCreateProgramaOpen(false);
            }}
            fullWidth
            maxWidth="xs"
          >
            <DialogTitle>Crear programa</DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                margin="dense"
                label="Nombre del nuevo programa"
                fullWidth
                value={newProgramaNombre}
                onChange={(event) => setNewProgramaNombre(event.target.value)}
                onKeyDown={async (event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const normalized = newProgramaNombre.trim();
                  if (!normalized || isCreatingPrograma) return;
                  const createdProgram = await onCreatePrograma(normalized);
                  if (createdProgram) {
                    updateForm("programa", createdProgram);
                    setCreateProgramaOpen(false);
                    setNewProgramaNombre("");
                  }
                }}
                disabled={isCreatingPrograma}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  if (isCreatingPrograma) return;
                  setCreateProgramaOpen(false);
                }}
                disabled={isCreatingPrograma}
              >
                Cancelar
              </Button>
              <Button
                variant="contained"
                disabled={!newProgramaNombre.trim() || isCreatingPrograma}
                onClick={async () => {
                  const normalized = newProgramaNombre.trim();
                  if (!normalized) return;
                  const createdProgram = await onCreatePrograma(normalized);
                  if (createdProgram) {
                    updateForm("programa", createdProgram);
                    setCreateProgramaOpen(false);
                    setNewProgramaNombre("");
                  }
                }}
              >
                {isCreatingPrograma ? "Creando..." : "Crear"}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      ) : null}

      {(docenteSolicitudesView === "list" || !canCreateShortcut) && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Listado de solicitudes
          </Typography>
          {solicitudes.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No hay solicitudes registradas.
            </Typography>
          )}
          {solicitudes.length > 0 && (
            <Stack spacing={1.4}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "repeat(3, minmax(0, 1fr))",
                    lg: "repeat(6, minmax(0, 1fr))"
                  },
                  gap: 1
                }}
              >
                <Paper variant="outlined" sx={{ p: 1.2 }}>
                  <Typography variant="caption" color="text.secondary">
                    Total
                  </Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                    {solicitudes.length}
                  </Typography>
                </Paper>
                {statusSummary.map((summary) => (
                  <Paper key={summary.estado} variant="outlined" sx={{ p: 1.2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {summary.label}
                    </Typography>
                    <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                      {summary.count}
                    </Typography>
                  </Paper>
                ))}
              </Box>

              <Stack spacing={1.2}>
                {solicitudes.map((item) => {
                  const joinUrl =
                    item.zoomJoinUrl ??
                    item.zoomInstances?.find((instance) => instance.joinUrl)?.joinUrl ??
                    null;
                  const instanceCount = item.zoomInstanceCount ?? item.zoomInstances?.length ?? 1;
                  const instances = item.zoomInstances ?? [];
                  const isExpanded = expandedSolicitudId === item.id;
                  const accountLabel =
                    item.zoomHostAccount ||
                    item.cuentaZoomAsignada?.ownerEmail ||
                    item.cuentaZoomAsignada?.nombreCuenta ||
                    "-";
                  const accountColor = getZoomAccountColor(accountLabel);
                  const requesterLabel = item.requestedBy?.name || item.requestedBy?.email || "-";
                  const responsableLabel = item.responsableNombre?.trim() || requesterLabel;
                  const meetingIdDisplay =
                    item.estadoSolicitud === "PENDIENTE_RESOLUCION_MANUAL_ID"
                      ? "Pendiente"
                      : item.meetingPrincipalId || "-";
                  const solicitudStatus = mapSolicitudStatus(item.estadoSolicitud);
                  const isSolicitudCancelled =
                    item.estadoSolicitud === "CANCELADA_ADMIN" || item.estadoSolicitud === "CANCELADA_DOCENTE";
                  const statusAccent =
                    solicitudStatus.color === "success"
                      ? "success.main"
                      : solicitudStatus.color === "warning"
                        ? "warning.main"
                        : solicitudStatus.color === "error"
                          ? "error.main"
                          : solicitudStatus.color === "info"
                            ? "info.main"
                            : "grey.400";
                  const sortedInstances = [...instances].sort(
                    (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
                  );
                  const upcomingInstance =
                    sortedInstances.find((instance) => new Date(instance.startTime).getTime() >= Date.now()) ??
                    sortedInstances[0];

                  return (
                    <Paper
                      key={item.id}
                      variant="outlined"
                      sx={{
                        borderRadius: 2.2,
                        overflow: "hidden",
                        borderLeft: "6px solid",
                        borderLeftColor: statusAccent
                      }}
                    >
                      <Box sx={{ p: { xs: 1.3, sm: 1.7 } }}>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: "flex-start", md: "center" }}
                          sx={{ mb: 1 }}
                        >
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                              {item.titulo}
                            </Typography>
                            <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.7 }}>
                              <Chip size="small" color={solicitudStatus.color} label={solicitudStatus.label} />
                              <Chip size="small" variant="outlined" label={`${instanceCount} instancia(s)`} />
                              <Chip size="small" variant="outlined" label={item.modalidadReunion} />
                            </Stack>
                          </Box>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {joinUrl ? (
                              <Button
                                size="small"
                                variant="contained"
                                color="secondary"
                                href={joinUrl}
                                target="_blank"
                                rel="noreferrer"
                                endIcon={<LaunchIcon fontSize="small" />}
                              >
                                Abrir
                              </Button>
                            ) : null}
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() =>
                                setExpandedSolicitudId((prev) => (prev === item.id ? null : item.id))
                              }
                              disabled={instances.length === 0}
                              endIcon={isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            >
                              {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                            </Button>
                          </Stack>
                        </Stack>

                        <Box
                          sx={{
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
                              Solicitado por
                            </Typography>
                            <Typography variant="body2">{requesterLabel}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Responsable
                            </Typography>
                            <Typography variant="body2">{responsableLabel}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Cuenta anfitriona (Zoom)
                            </Typography>
                            <Stack direction="row" spacing={0.8} alignItems="center">
                              <Box
                                aria-hidden
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  backgroundColor: accountColor,
                                  border: "1px solid",
                                  borderColor: "divider",
                                  flexShrink: 0
                                }}
                              />
                              <Typography variant="body2">{accountLabel}</Typography>
                            </Stack>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              Proxima instancia
                            </Typography>
                            <Typography variant="body2">
                              {upcomingInstance ? formatDateTime(upcomingInstance.startTime) : "Sin instancias"}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">
                              ID de reunion
                            </Typography>
                            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                              {meetingIdDisplay}
                            </Typography>
                          </Box>
                        </Box>

                        {canDeleteSolicitud && (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1.2 }}>
                            <Button
                              type="button"
                              size="small"
                              variant="outlined"
                              color="warning"
                              startIcon={<CancelScheduleSendOutlinedIcon fontSize="small" />}
                              disabled={isSolicitudCancelled || cancellingSerieSolicitudId === item.id}
                              onClick={() => onCancelSolicitudSerie(item.id, item.titulo)}
                            >
                              {cancellingSerieSolicitudId === item.id
                                ? "Cancelando..."
                                : instanceCount > 1
                                  ? "Cancelar serie"
                                  : "Cancelar reunion"}
                            </Button>
                            <Button
                              type="button"
                              size="small"
                              variant="outlined"
                              color="error"
                              startIcon={<DeleteOutlineIcon fontSize="small" />}
                              onClick={() => onDeleteSolicitud(item.id)}
                              disabled={deletingSolicitudId === item.id}
                            >
                              {deletingSolicitudId === item.id ? "Eliminando..." : "Eliminar"}
                            </Button>
                          </Stack>
                        )}
                      </Box>

                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, backgroundColor: "grey.50", borderTop: "1px solid", borderColor: "divider" }}>
                          <Typography variant="subtitle2" sx={{ mb: 1.2 }}>
                            Detalle de instancias ({instances.length}) - anfitriona: {accountLabel}
                          </Typography>
                          {renderInstanceList(item, instances, isSolicitudCancelled)}
                        </Box>
                      </Collapse>
                    </Paper>
                  );
                })}
              </Stack>
            </Stack>
          )}
        </Box>
      )}
      </CardContent>
    </Card>
  );
}
