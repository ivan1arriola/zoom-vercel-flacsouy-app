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
  showHoursPanel?: boolean;
}

const modalidadCards: Array<{ key: TarifaModalidad; label: string }> = [
  { key: "VIRTUAL", label: "Virtual" },
  { key: "HIBRIDA", label: "Hibrida" }
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatAmount(value: number, currency: string): string {
  const formatted = new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(round2(value));
  return currency ? `${currency} ${formatted}` : formatted;
}

function resolveMonthProjection(monthKey: string): {
  isCurrentMonth: boolean;
  isPastMonth: boolean;
  isFutureMonth: boolean;
  factor: number;
  elapsedDays: number;
  daysInMonth: number;
} {
  const [yearRaw = "0", monthRaw = "0"] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return {
      isCurrentMonth: false,
      isPastMonth: false,
      isFutureMonth: false,
      factor: 1,
      elapsedDays: 0,
      daysInMonth: 0
    };
  }

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const isCurrentMonth = year === nowYear && month === nowMonth;
  const isPastMonth = year < nowYear || (year === nowYear && month < nowMonth);
  const isFutureMonth = year > nowYear || (year === nowYear && month > nowMonth);
  const daysInMonth = new Date(year, month, 0).getDate();

  if (isCurrentMonth) {
    const elapsedDays = Math.min(daysInMonth, Math.max(1, now.getDate()));
    return {
      isCurrentMonth,
      isPastMonth,
      isFutureMonth,
      factor: daysInMonth / elapsedDays,
      elapsedDays,
      daysInMonth
    };
  }

  if (isPastMonth) {
    return {
      isCurrentMonth,
      isPastMonth,
      isFutureMonth,
      factor: 1,
      elapsedDays: daysInMonth,
      daysInMonth
    };
  }

  return {
    isCurrentMonth,
    isPastMonth,
    isFutureMonth,
    factor: 0,
    elapsedDays: 0,
    daysInMonth
  };
}

function formatMonthKey(monthKey: string): string {
  const [yearRaw = "0", monthRaw = "1"] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(Date.UTC(year, Math.max(0, month - 1), 1));
  return date.toLocaleDateString("es-UY", { month: "long", year: "numeric", timeZone: "UTC" });
}

function getMonthOptions(payload: PersonHoursResponse | null): string[] {
  if (!payload) return [];

  if (Array.isArray(payload.availableMonthKeys) && payload.availableMonthKeys.length > 0) {
    return [...payload.availableMonthKeys].sort((a, b) => b.localeCompare(a));
  }

  const monthSet = new Set<string>();
  for (const summary of payload.assistantSummaries ?? []) {
    for (const month of summary.months) {
      if (month.monthKey) monthSet.add(month.monthKey);
    }
  }
  return Array.from(monthSet.values()).sort((a, b) => b.localeCompare(a));
}

export function SpaTabTarifas({
  tarifaFormByModalidad,
  setTarifaFormByModalidad,
  isSubmittingTarifa,
  currentTarifaByModalidad,
  onSubmit,
  showHoursPanel = true
}: SpaTabTarifasProps) {
  const [personHours, setPersonHours] = useState<PersonHoursResponse | null>(null);
  const [isLoadingPersonHours, setIsLoadingPersonHours] = useState(false);
  const [personHoursError, setPersonHoursError] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("");

  async function refreshPersonHours() {
    setIsLoadingPersonHours(true);
    setPersonHoursError("");
    try {
      const payload = await loadPersonHours();
      if (!payload) {
        setPersonHoursError("No se pudo cargar el historial por persona.");
        return;
      }
      setPersonHours(payload);
      const nextMonthOptions = getMonthOptions(payload);
      setSelectedMonthKey((current) => {
        if (nextMonthOptions.length === 0) return "";
        if (current && nextMonthOptions.includes(current)) return current;
        return nextMonthOptions[0];
      });
    } finally {
      setIsLoadingPersonHours(false);
    }
  }

  useEffect(() => {
    if (!showHoursPanel) return;
    void refreshPersonHours();
  }, [showHoursPanel]);

  const currencyByModalidad = useMemo(
    () => ({
      VIRTUAL: (currentTarifaByModalidad.VIRTUAL?.moneda ?? "").trim().toUpperCase(),
      HIBRIDA: (currentTarifaByModalidad.HIBRIDA?.moneda ?? "").trim().toUpperCase()
    }),
    [currentTarifaByModalidad]
  );
  const hasMixedCurrencies = useMemo(
    () =>
      Boolean(
        currencyByModalidad.VIRTUAL &&
        currencyByModalidad.HIBRIDA &&
        currencyByModalidad.VIRTUAL !== currencyByModalidad.HIBRIDA
      ),
    [currencyByModalidad]
  );
  const projection = useMemo(() => resolveMonthProjection(selectedMonthKey), [selectedMonthKey]);
  const projectionAmountLabel = projection.isCurrentMonth ? "Proyeccion fin de mes" : "Total estimado del mes";

  const monthOptions = useMemo(() => getMonthOptions(personHours), [personHours]);
  const assistantRows = useMemo(() => {
    return (personHours?.assistantSummaries ?? []).map((assistant) => {
      const monthSummary = selectedMonthKey
        ? assistant.months.find((month) => month.monthKey === selectedMonthKey) ?? null
        : null;
      const selectedMonthAmountVirtual = monthSummary?.estimatedAmountVirtual ?? 0;
      const selectedMonthAmountHibrida = monthSummary?.estimatedAmountHibrida ?? 0;
      const selectedMonthAmount = monthSummary?.estimatedAmount ?? 0;
      return {
        ...assistant,
        selectedMonthMeetings: monthSummary?.meetingsCount ?? 0,
        selectedMonthHours: monthSummary?.totalHours ?? 0,
        selectedMonthVirtualHours: monthSummary?.virtualHours ?? 0,
        selectedMonthHibridaHours: monthSummary?.hibridaHours ?? 0,
        selectedMonthAmountVirtual,
        selectedMonthAmountHibrida,
        selectedMonthAmount,
        projectedMonthAmountVirtual: round2(selectedMonthAmountVirtual * projection.factor),
        projectedMonthAmountHibrida: round2(selectedMonthAmountHibrida * projection.factor),
        projectedMonthAmount: round2(selectedMonthAmount * projection.factor),
        selectedMonthOverrunAlerts: monthSummary?.overrunAlerts ?? 0
      };
    });
  }, [personHours, projection.factor, selectedMonthKey]);
  const selectedMonthLabel = useMemo(
    () => (selectedMonthKey ? formatMonthKey(selectedMonthKey) : "Sin datos"),
    [selectedMonthKey]
  );
  const selectedMonthTotals = useMemo(() => {
    const meetings = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthMeetings, 0);
    const hoursRaw = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthHours, 0);
    const virtualHoursRaw = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthVirtualHours, 0);
    const hibridaHoursRaw = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthHibridaHours, 0);
    const amountRaw = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthAmount, 0);
    const amountVirtualRaw = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthAmountVirtual, 0);
    const amountHibridaRaw = assistantRows.reduce((acc, assistant) => acc + assistant.selectedMonthAmountHibrida, 0);
    const projectedAmountRaw = assistantRows.reduce((acc, assistant) => acc + assistant.projectedMonthAmount, 0);
    const projectedAmountVirtualRaw = assistantRows.reduce(
      (acc, assistant) => acc + assistant.projectedMonthAmountVirtual,
      0
    );
    const projectedAmountHibridaRaw = assistantRows.reduce(
      (acc, assistant) => acc + assistant.projectedMonthAmountHibrida,
      0
    );
    const overrunAlerts = assistantRows.reduce(
      (acc, assistant) => acc + assistant.selectedMonthOverrunAlerts,
      0
    );
    return {
      assistants: assistantRows.length,
      activeAssistants: assistantRows.filter((assistant) => assistant.selectedMonthHours > 0).length,
      meetings,
      hours: round2(hoursRaw),
      virtualHours: round2(virtualHoursRaw),
      hibridaHours: round2(hibridaHoursRaw),
      amount: round2(amountRaw),
      amountVirtual: round2(amountVirtualRaw),
      amountHibrida: round2(amountHibridaRaw),
      projectedAmount: round2(projectedAmountRaw),
      projectedAmountVirtual: round2(projectedAmountVirtualRaw),
      projectedAmountHibrida: round2(projectedAmountHibridaRaw),
      overrunAlerts
    };
  }, [assistantRows]);

  useEffect(() => {
    if (monthOptions.length === 0) {
      if (selectedMonthKey) setSelectedMonthKey("");
      return;
    }
    if (!selectedMonthKey || !monthOptions.includes(selectedMonthKey)) {
      setSelectedMonthKey(monthOptions[0]);
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

      {showHoursPanel ? (
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
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.4 }}>
                  La proyeccion toma el ritmo de horas acumuladas y lo extrapola al cierre del mes.
                </Typography>
              </Box>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ minWidth: { md: 320 } }}>
                <TextField
                  select
                  size="small"
                  label="Mes"
                  value={selectedMonthKey}
                  onChange={(event) => setSelectedMonthKey(String(event.target.value))}
                  disabled={isLoadingPersonHours || monthOptions.length === 0}
                >
                  {monthOptions.length === 0 ? (
                    <MenuItem value="" disabled>
                      Sin meses con actividad
                    </MenuItem>
                  ) : null}
                  {monthOptions.map((monthKey) => (
                    <MenuItem key={monthKey} value={monthKey}>
                      {formatMonthKey(monthKey)}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="outlined"
                  disabled={isLoadingPersonHours}
                  onClick={() => {
                    void refreshPersonHours();
                  }}
                >
                  {isLoadingPersonHours ? "Actualizando..." : "Actualizar"}
                </Button>
              </Stack>
            </Stack>

            {personHoursError ? <Alert severity="error" sx={{ mb: 1.5 }}>{personHoursError}</Alert> : null}

            {monthOptions.length > 0 ? (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
                <Chip variant="outlined" label={selectedMonthLabel} />
                <Chip variant="outlined" label={`${selectedMonthTotals.assistants} asistentes`} />
                <Chip variant="outlined" label={`${selectedMonthTotals.activeAssistants} con horas`} />
                <Chip variant="outlined" label={`${selectedMonthTotals.meetings} reuniones`} />
                <Chip color="success" variant="filled" label={`${selectedMonthTotals.hours} h`} />
                <Chip variant="outlined" label={`Virtual ${selectedMonthTotals.virtualHours} h`} />
                <Chip variant="outlined" label={`Hibrida ${selectedMonthTotals.hibridaHours} h`} />
                {hasMixedCurrencies ? (
                  <Chip
                    color="primary"
                    variant="outlined"
                    label={`Acumulado: Virtual ${formatAmount(selectedMonthTotals.amountVirtual, currencyByModalidad.VIRTUAL)} + Hibrida ${formatAmount(selectedMonthTotals.amountHibrida, currencyByModalidad.HIBRIDA)}`}
                  />
                ) : (
                  <Chip
                    color="primary"
                    variant="outlined"
                    label={`Acumulado: ${formatAmount(selectedMonthTotals.amount, currencyByModalidad.VIRTUAL || currencyByModalidad.HIBRIDA)}`}
                  />
                )}
                {hasMixedCurrencies ? (
                  <Chip
                    color="secondary"
                    variant="outlined"
                    label={`${projectionAmountLabel}: Virtual ${formatAmount(selectedMonthTotals.projectedAmountVirtual, currencyByModalidad.VIRTUAL)} + Hibrida ${formatAmount(selectedMonthTotals.projectedAmountHibrida, currencyByModalidad.HIBRIDA)}`}
                  />
                ) : (
                  <Chip
                    color="secondary"
                    variant="outlined"
                    label={`${projectionAmountLabel}: ${formatAmount(selectedMonthTotals.projectedAmount, currencyByModalidad.VIRTUAL || currencyByModalidad.HIBRIDA)}`}
                  />
                )}
                {projection.isCurrentMonth ? (
                  <Chip
                    variant="outlined"
                    label={`Proyeccion por ritmo: ${projection.elapsedDays}/${projection.daysInMonth} dias`}
                  />
                ) : null}
                {selectedMonthTotals.overrunAlerts > 0 ? (
                  <Chip
                    color="warning"
                    variant="outlined"
                    label={`${selectedMonthTotals.overrunAlerts} alerta(s) por exceso >= 60 min`}
                  />
                ) : null}
              </Stack>
            ) : null}

            {!isLoadingPersonHours && monthOptions.length === 0 ? (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                No hay horas cumplidas registradas todavia.
              </Alert>
            ) : null}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 1.2
              }}
            >
              {assistantRows.map((assistant) => (
                <Card key={assistant.userId} variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ p: 1.5 }}>
                    <Stack spacing={1}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          {assistant.nombre}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {assistant.email}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
                        <Chip size="small" variant="outlined" label={assistant.role} />
                        <Chip size="small" variant="outlined" label={`${assistant.selectedMonthMeetings} reuniones`} />
                        <Chip
                          size="small"
                          color={assistant.selectedMonthHours > 0 ? "success" : "default"}
                          label={`${assistant.selectedMonthHours} h`}
                        />
                        {assistant.selectedMonthVirtualHours > 0 ? (
                          <Chip size="small" variant="outlined" label={`V ${assistant.selectedMonthVirtualHours} h`} />
                        ) : null}
                        {assistant.selectedMonthHibridaHours > 0 ? (
                          <Chip size="small" variant="outlined" label={`H ${assistant.selectedMonthHibridaHours} h`} />
                        ) : null}
                        {assistant.selectedMonthOverrunAlerts > 0 ? (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`${assistant.selectedMonthOverrunAlerts} alerta(s)`}
                          />
                        ) : null}
                      </Stack>
                      {assistant.selectedMonthHours > 0 ? (
                        <Stack spacing={0.3}>
                          <Typography variant="caption" color="text.secondary">
                            Acumulado estimado: {hasMixedCurrencies
                              ? `Virtual ${formatAmount(assistant.selectedMonthAmountVirtual, currencyByModalidad.VIRTUAL)} + Hibrida ${formatAmount(assistant.selectedMonthAmountHibrida, currencyByModalidad.HIBRIDA)}`
                              : formatAmount(
                                assistant.selectedMonthAmount,
                                currencyByModalidad.VIRTUAL || currencyByModalidad.HIBRIDA
                              )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {projectionAmountLabel}: {hasMixedCurrencies
                              ? `Virtual ${formatAmount(assistant.projectedMonthAmountVirtual, currencyByModalidad.VIRTUAL)} + Hibrida ${formatAmount(assistant.projectedMonthAmountHibrida, currencyByModalidad.HIBRIDA)}`
                              : formatAmount(
                                assistant.projectedMonthAmount,
                                currencyByModalidad.VIRTUAL || currencyByModalidad.HIBRIDA
                              )}
                          </Typography>
                        </Stack>
                      ) : null}

                      {assistant.hasAssistantProfile ? (
                        <Typography variant="caption" color="text.secondary">
                          Acumulado historico: {assistant.totalCompletedHours} h en {assistant.totalCompletedMeetings} reunion(es)
                          {assistant.totalOverrunAlerts > 0
                            ? `. Alertas por exceso >= 60 min: ${assistant.totalOverrunAlerts}.`
                            : "."}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Sin perfil de asistencia activo.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
