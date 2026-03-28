"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  loadPersonHours,
  type PersonHoursResponse,
  type Tarifa
} from "@/src/services/tarifasApi";
import type { TarifaConfigForm, TarifaModalidad } from "@/src/hooks/useTarifas";

interface SpaTabTarifasProps {
  tarifaFormByModalidad: Record<TarifaModalidad, TarifaConfigForm>;
  setTarifaFormByModalidad: (
    form:
      | Record<TarifaModalidad, TarifaConfigForm>
      | ((prev: Record<TarifaModalidad, TarifaConfigForm>) => Record<TarifaModalidad, TarifaConfigForm>)
  ) => void;
  isSubmittingTarifa: boolean;
  currentTarifaByModalidad: Record<TarifaModalidad, Tarifa | undefined>;
  onSubmit: (modalidad: TarifaModalidad) => void | Promise<void>;
}

const modalidadCards: Array<{ key: TarifaModalidad; label: string }> = [
  { key: "VIRTUAL", label: "Virtual" },
  { key: "HIBRIDA", label: "Hibrida" }
];
type StatusFilter = "ALL" | "COMPLETED" | "PENDING";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-UY", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatMonthKey(monthKey: string): string {
  const [yearRaw = "0", monthRaw = "1"] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return date.toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getMonthKeyFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function SpaTabTarifas({
  tarifaFormByModalidad,
  setTarifaFormByModalidad,
  isSubmittingTarifa,
  currentTarifaByModalidad,
  onSubmit
}: SpaTabTarifasProps) {
  const [personHours, setPersonHours] = useState<PersonHoursResponse | null>(null);
  const [isLoadingPersonHours, setIsLoadingPersonHours] = useState(false);
  const [personHoursError, setPersonHoursError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("ALL");

  async function refreshPersonHours(userId?: string) {
    setIsLoadingPersonHours(true);
    setPersonHoursError("");
    try {
      const payload = await loadPersonHours(userId);
      if (!payload) {
        setPersonHoursError("No se pudo cargar el historial por persona.");
        return;
      }
      setPersonHours(payload);
      setSelectedUserId(payload.selectedUserId ?? "");
    } finally {
      setIsLoadingPersonHours(false);
    }
  }

  useEffect(() => {
    void refreshPersonHours();
  }, []);

  const selectedPerson = useMemo(
    () => personHours?.people.find((person) => person.userId === selectedUserId) ?? null,
    [personHours, selectedUserId]
  );
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const meeting of personHours?.meetings ?? []) {
      const monthKey = getMonthKeyFromIso(meeting.inicioAt);
      if (monthKey) months.add(monthKey);
    }
    return Array.from(months.values()).sort((a, b) => b.localeCompare(a));
  }, [personHours]);
  const filteredMeetings = useMemo(() => {
    return (personHours?.meetings ?? []).filter((meeting) => {
      const monthKey = getMonthKeyFromIso(meeting.inicioAt);
      const monthOk = selectedMonthKey === "ALL" || monthKey === selectedMonthKey;
      const statusOk =
        selectedStatus === "ALL" ||
        (selectedStatus === "COMPLETED" ? meeting.isCompleted : !meeting.isCompleted);
      return monthOk && statusOk;
    });
  }, [personHours, selectedMonthKey, selectedStatus]);
  const filteredTotals = useMemo(() => {
    const completed = filteredMeetings.filter((meeting) => meeting.isCompleted);
    const completedMinutes = completed.reduce((acc, meeting) => acc + meeting.minutos, 0);
    return {
      meetingsTotal: filteredMeetings.length,
      completedMeetingsTotal: completed.length,
      completedMinutesTotal: completedMinutes,
      completedHoursTotal: Math.round((completedMinutes / 60) * 100) / 100
    };
  }, [filteredMeetings]);
  const filteredMonthSummaries = useMemo(() => {
    const monthMap = new Map<string, { monthKey: string; meetingsCount: number; totalMinutes: number }>();
    for (const meeting of filteredMeetings) {
      if (!meeting.isCompleted) continue;
      const monthKey = getMonthKeyFromIso(meeting.inicioAt);
      if (!monthKey) continue;
      const current = monthMap.get(monthKey) ?? { monthKey, meetingsCount: 0, totalMinutes: 0 };
      current.meetingsCount += 1;
      current.totalMinutes += meeting.minutos;
      monthMap.set(monthKey, current);
    }
    return Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((item) => ({
        ...item,
        totalHours: Math.round((item.totalMinutes / 60) * 100) / 100
      }));
  }, [filteredMeetings]);

  useEffect(() => {
    if (selectedMonthKey !== "ALL" && !monthOptions.includes(selectedMonthKey)) {
      setSelectedMonthKey("ALL");
    }
  }, [monthOptions, selectedMonthKey]);

  return (
    <Stack spacing={2}>
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Tarifas por modalidad
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Solo hay dos configuraciones activas en el sistema.
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 2
            }}
          >
            {modalidadCards.map(({ key, label }) => (
              <Card
                key={key}
                variant="outlined"
                component="form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void onSubmit(key);
                }}
                sx={{ borderRadius: 2 }}
              >
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Actual: {currentTarifaByModalidad[key]?.valorHora ?? "-"} {currentTarifaByModalidad[key]?.moneda ?? ""}
                    </Typography>

                    <TextField
                      label="Valor por hora"
                      type="number"
                      required
                      inputProps={{ min: 0, step: 0.01 }}
                      value={tarifaFormByModalidad[key].valorHora}
                      onChange={(e) =>
                        setTarifaFormByModalidad((prev) => ({
                          ...prev,
                          [key]: {
                            ...prev[key],
                            valorHora: e.target.value
                          }
                        }))
                      }
                    />

                    <TextField
                      label="Moneda"
                      required
                      value={tarifaFormByModalidad[key].moneda}
                      onChange={(e) =>
                        setTarifaFormByModalidad((prev) => ({
                          ...prev,
                          [key]: {
                            ...prev[key],
                            moneda: e.target.value.toUpperCase()
                          }
                        }))
                      }
                    />

                    <Button type="submit" variant="contained" disabled={isSubmittingTarifa}>
                      {isSubmittingTarifa ? "Guardando..." : `Actualizar ${label}`}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.2}
            alignItems={{ xs: "stretch", md: "center" }}
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
          >
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Horas cumplidas por persona
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Vista para Administracion y Contaduria: reuniones y horas efectivas por mes.
              </Typography>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { md: 420 } }}>
              <TextField
                select
                label="Persona"
                size="small"
                value={selectedUserId}
                onChange={(event) => {
                  const nextUserId = String(event.target.value);
                  setSelectedUserId(nextUserId);
                  setSelectedMonthKey("ALL");
                  setSelectedStatus("ALL");
                  void refreshPersonHours(nextUserId);
                }}
                disabled={isLoadingPersonHours}
              >
                {(personHours?.people ?? []).map((person) => (
                  <MenuItem key={person.userId} value={person.userId}>
                    {person.nombre} ({person.email})
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                disabled={isLoadingPersonHours}
                onClick={() => {
                  void refreshPersonHours(selectedUserId || undefined);
                }}
              >
                {isLoadingPersonHours ? "Actualizando..." : "Actualizar"}
              </Button>
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            sx={{ mb: 1.5, maxWidth: 520 }}
          >
            <TextField
              select
              size="small"
              label="Mes"
              value={selectedMonthKey}
              onChange={(event) => setSelectedMonthKey(String(event.target.value))}
            >
              <MenuItem value="ALL">Todos</MenuItem>
              {monthOptions.map((monthKey) => (
                <MenuItem key={monthKey} value={monthKey}>
                  {formatMonthKey(monthKey)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Estado"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(String(event.target.value) as StatusFilter)}
            >
              <MenuItem value="ALL">Todas</MenuItem>
              <MenuItem value="COMPLETED">Cumplidas</MenuItem>
              <MenuItem value="PENDING">Pendientes</MenuItem>
            </TextField>
          </Stack>

          {personHoursError ? <Alert severity="error" sx={{ mb: 1.5 }}>{personHoursError}</Alert> : null}

          {selectedPerson ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
              <Chip label={selectedPerson.nombre} color="primary" variant="outlined" />
              <Chip label={selectedPerson.role} variant="outlined" />
              <Chip label={`${filteredTotals.meetingsTotal} reuniones`} variant="outlined" />
              <Chip
                color="success"
                label={`${filteredTotals.completedHoursTotal} h cumplidas`}
                variant="filled"
              />
            </Stack>
          ) : null}

          {selectedPerson && !selectedPerson.hasAssistantProfile ? (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              Esta persona no tiene reuniones de asistencia registradas.
            </Alert>
          ) : null}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 1.2,
              mb: 1.5
            }}
          >
            {filteredMonthSummaries.map((month) => (
              <Card key={month.monthKey} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: "capitalize" }}>
                    {formatMonthKey(month.monthKey)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {month.meetingsCount} reunion(es)
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {month.totalHours} h
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Stack spacing={1}>
            {filteredMeetings.map((meeting) => (
              <Card key={meeting.assignmentId} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {meeting.titulo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {meeting.programaNombre || "Sin programa"}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                      <Chip size="small" variant="outlined" label={meeting.modalidadReunion} />
                      <Chip size="small" variant="outlined" label={`${meeting.minutos} min`} />
                      <Chip
                        size="small"
                        color={meeting.isCompleted ? "success" : "default"}
                        label={meeting.isCompleted ? "Cumplida" : "Pendiente"}
                      />
                    </Stack>
                  </Stack>

                  <Box
                    sx={{
                      mt: 1,
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        md: "repeat(3, minmax(0, 1fr))"
                      },
                      gap: 1
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary">Inicio</Typography>
                      <Typography variant="body2">{formatDateTime(meeting.inicioAt)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Fin</Typography>
                      <Typography variant="body2">{formatDateTime(meeting.finAt)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Meeting ID</Typography>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {meeting.zoomMeetingId || "-"}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {!isLoadingPersonHours && filteredMeetings.length === 0 ? (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              No hay reuniones para los filtros seleccionados.
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
