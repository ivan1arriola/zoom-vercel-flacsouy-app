import {
  buildRecurringStarts,
  buildRecurrenceSummary,
  getZoomWeekday,
  parseWeekdaysCsv
} from "@/src/lib/spa-home/recurrence";
import type { ZoomMonthlyMode, ZoomRecurrenceType } from "@/src/lib/spa-home/recurrence";
import type { SolicitudFormState } from "@/src/lib/spa-home/solicitud-form";
import type { SubmitDocenteSolicitudPayload } from "@/src/services/solicitudesApi";
import { combineDateAndTimeToIso, resolveEndByTimeOrDuration } from "@/components/spa-tabs/form-validators";

const DEFAULT_TIMEZONE = "America/Montevideo";

const MAX_REPEAT_INTERVAL_BY_TYPE: Record<ZoomRecurrenceType, number> = {
  "1": 90,
  "2": 12,
  "3": 3
};

type BuildDocenteSolicitudPayloadInput = {
  form: SolicitudFormState;
  metadata: string;
  normalizedDocentesCorreos?: string;
  timezone?: string;
};

type ParsedSpecificDates = {
  dates: string[];
  errors: string[];
};

type SharedPayloadFields = Pick<
  SubmitDocenteSolicitudPayload,
  | "titulo"
  | "responsableNombre"
  | "programaNombre"
  | "descripcion"
  | "finalidadAcademica"
  | "modalidadReunion"
  | "timezone"
  | "docentesCorreos"
  | "grabacionPreferencia"
  | "requiereGrabacion"
  | "requiereAsistencia"
  | "motivoAsistencia"
>;

function buildDescripcion(base: string, metadata: string): string {
  return [base.trim(), metadata].filter(Boolean).join("\n\n");
}

function buildGrabacionPreferencia(
  grabacion: SolicitudFormState["grabacion"]
): SubmitDocenteSolicitudPayload["grabacionPreferencia"] {
  if (grabacion === "SI") return "SI";
  if (grabacion === "NO") return "NO";
  return "A_DEFINIR";
}

function buildSharedPayloadFields(
  input: BuildDocenteSolicitudPayloadInput,
  descripcionBase: string
): SharedPayloadFields {
  const { form, metadata, normalizedDocentesCorreos } = input;
  const requiereAsistencia = form.asistenciaZoom === "SI";
  const requiereGrabacion = form.grabacion === "SI";

  return {
    titulo: form.tema.trim(),
    responsableNombre: form.responsable.trim(),
    programaNombre: form.programa.trim(),
    descripcion: buildDescripcion(descripcionBase, metadata),
    finalidadAcademica: form.programa.trim() || undefined,
    modalidadReunion: form.modalidad,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    docentesCorreos: normalizedDocentesCorreos,
    grabacionPreferencia: buildGrabacionPreferencia(form.grabacion),
    requiereGrabacion,
    requiereAsistencia,
    motivoAsistencia: requiereAsistencia ? "Asistencia solicitada desde formulario docente." : undefined
  };
}

function toIsoLocalDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  const monthValue = String(month).padStart(2, "0");
  const dayValue = String(day).padStart(2, "0");
  return `${year}-${monthValue}-${dayValue}`;
}

function parseSpecificDateToken(token: string, fallbackYear: number): string | null {
  const normalized = token.trim();
  if (!normalized) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return toIsoLocalDate(year, month, day);
  }

  const shortMatch = /^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/.exec(normalized);
  if (!shortMatch) return null;

  const day = Number(shortMatch[1]);
  const month = Number(shortMatch[2]);
  const yearRaw = shortMatch[3];
  const year = yearRaw
    ? (yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw))
    : fallbackYear;

  return toIsoLocalDate(year, month, day);
}

export function parseSpecificDatesInput(rawInput: string, fallbackYear = new Date().getFullYear()): ParsedSpecificDates {
  const tokens = rawInput
    .replace(/\r\n/g, "\n")
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const uniqueDates = new Set<string>();
  const errors: string[] = [];

  for (const token of tokens) {
    const parsed = parseSpecificDateToken(token, fallbackYear);
    if (!parsed) {
      errors.push(`Fecha invalida: "${token}". Usa DD/MM, DD/MM/AAAA o AAAA-MM-DD.`);
      continue;
    }
    uniqueDates.add(parsed);
  }

  const dates = Array.from(uniqueDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return { dates, errors };
}

function buildSingleSolicitudPayload(
  input: BuildDocenteSolicitudPayloadInput
): SubmitDocenteSolicitudPayload {
  const { form } = input;
  const startIso = combineDateAndTimeToIso(form.diaUnica, form.horaInicioUnica, "dia y hora de inicio");
  const { endIso } = resolveEndByTimeOrDuration(
    startIso,
    form.horaFinUnica,
    form.duracionUnica,
    "la reunion unica"
  );

  return {
    ...buildSharedPayloadFields(input, form.descripcionUnica),
    tipoInstancias: "UNICA",
    fechaInicioSolicitada: startIso,
    fechaFinSolicitada: endIso
  };
}

function buildRecurringSolicitudPayload(
  input: BuildDocenteSolicitudPayloadInput
): SubmitDocenteSolicitudPayload {
  const { form } = input;
  const firstAnchorIso = combineDateAndTimeToIso(
    form.primerDiaRecurrente,
    form.horaInicioRecurrente,
    "primer dia y hora de inicio"
  );
  const firstAnchorDate = new Date(firstAnchorIso);
  const { durationMinutes } = resolveEndByTimeOrDuration(
    firstAnchorIso,
    form.horaFinRecurrente,
    form.duracionRecurrente,
    "las reuniones periodicas"
  );

  if (!form.fechaFinal) {
    throw new Error("Debes completar la fecha final.");
  }

  const recurrenceEnd = new Date(`${form.fechaFinal}T${form.horaInicioRecurrente || "00:00"}`);
  if (Number.isNaN(recurrenceEnd.getTime())) {
    throw new Error("Fecha final invalida.");
  }
  if (recurrenceEnd <= firstAnchorDate) {
    throw new Error("La fecha final debe ser posterior a la primera fecha.");
  }

  const recurrenceType = form.recurrenciaTipoZoom as ZoomRecurrenceType;
  if (!["1", "2", "3"].includes(recurrenceType)) {
    throw new Error("Tipo de recurrencia invalido.");
  }

  const repeatInterval = Number(form.recurrenciaIntervalo);
  if (!Number.isInteger(repeatInterval) || repeatInterval < 1) {
    throw new Error("Intervalo de recurrencia invalido.");
  }

  const maxRepeatInterval = MAX_REPEAT_INTERVAL_BY_TYPE[recurrenceType];
  if (repeatInterval > maxRepeatInterval) {
    throw new Error(`El intervalo supera el maximo permitido por Zoom (${maxRepeatInterval}).`);
  }

  const weeklyDays = parseWeekdaysCsv(form.recurrenciaDiasSemana);
  if (recurrenceType === "2" && weeklyDays.length === 0) {
    throw new Error("Debes seleccionar al menos un dia para recurrencia semanal.");
  }

  const weeklyDaysForRule =
    recurrenceType === "2"
      ? [...new Set([...weeklyDays, getZoomWeekday(firstAnchorDate)])].sort((a, b) => a - b)
      : [];

  const monthlyMode = form.recurrenciaMensualModo as ZoomMonthlyMode;
  if (!["DAY_OF_MONTH", "WEEKDAY_OF_MONTH"].includes(monthlyMode)) {
    throw new Error("Modo mensual invalido.");
  }

  const monthlyDay = Number(form.recurrenciaDiaMes);
  if (
    recurrenceType === "3" &&
    monthlyMode === "DAY_OF_MONTH" &&
    (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31)
  ) {
    throw new Error("El dia del mes debe estar entre 1 y 31.");
  }

  const monthlyWeek = Number(form.recurrenciaSemanaMes) as -1 | 1 | 2 | 3 | 4;
  if (
    recurrenceType === "3" &&
    monthlyMode === "WEEKDAY_OF_MONTH" &&
    ![-1, 1, 2, 3, 4].includes(monthlyWeek)
  ) {
    throw new Error("La semana del mes es invalida.");
  }

  const monthlyWeekDay = Number(form.recurrenciaDiaSemanaMes);
  if (
    recurrenceType === "3" &&
    monthlyMode === "WEEKDAY_OF_MONTH" &&
    (!Number.isInteger(monthlyWeekDay) || monthlyWeekDay < 1 || monthlyWeekDay > 7)
  ) {
    throw new Error("El dia de semana mensual es invalido.");
  }
  const monthlyWeekDayValue = monthlyWeekDay as 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const recurringStarts = buildRecurringStarts({
    firstStart: firstAnchorDate,
    recurrenceEnd,
    recurrenceType,
    repeatInterval,
    weeklyDays: weeklyDaysForRule,
    monthlyMode,
    monthlyDay,
    monthlyWeek,
    monthlyWeekDay: monthlyWeekDayValue
  });

  if (recurringStarts.length < 2) {
    throw new Error("Con esa configuracion no se generan al menos 2 instancias.");
  }
  if (recurringStarts.length > 50) {
    throw new Error("Zoom permite un maximo de 50 ocurrencias por reunion recurrente.");
  }

  const firstInstanceStart = recurringStarts[0];
  const firstInstanceEndIso = new Date(firstInstanceStart.getTime() + durationMinutes * 60_000).toISOString();
  const recurrenceSummary = buildRecurrenceSummary({
    recurrenceType,
    repeatInterval,
    weeklyDays: weeklyDaysForRule,
    monthlyMode,
    monthlyDay,
    monthlyWeek,
    monthlyWeekDay: monthlyWeekDayValue,
    totalInstancias: recurringStarts.length,
    fechaFinal: form.fechaFinal
  });

  return {
    ...buildSharedPayloadFields(input, form.descripcionRecurrente),
    tipoInstancias: "MULTIPLE_COMPATIBLE_ZOOM",
    fechaInicioSolicitada: firstInstanceStart.toISOString(),
    fechaFinSolicitada: firstInstanceEndIso,
    fechaFinRecurrencia: recurrenceEnd.toISOString(),
    regimenEncuentros: recurrenceSummary,
    instanciasDetalle: recurringStarts.map((date) => ({
      inicioProgramadoAt: date.toISOString()
    })),
    patronRecurrencia: {
      totalInstancias: recurringStarts.length,
      fechaFinal: form.fechaFinal,
      zoomRecurrence: {
        type: Number(recurrenceType),
        repeat_interval: repeatInterval,
        weekly_days: recurrenceType === "2" ? weeklyDaysForRule.join(",") : undefined,
        monthly_day: recurrenceType === "3" && monthlyMode === "DAY_OF_MONTH" ? monthlyDay : undefined,
        monthly_week:
          recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH" ? monthlyWeek : undefined,
        monthly_week_day:
          recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH"
            ? monthlyWeekDayValue
            : undefined,
        end_times: recurringStarts.length
      }
    }
  };
}

function buildSpecificDatesSolicitudPayload(
  input: BuildDocenteSolicitudPayloadInput
): SubmitDocenteSolicitudPayload {
  const { form } = input;
  const fallbackYear = form.primerDiaRecurrente
    ? Number(form.primerDiaRecurrente.slice(0, 4))
    : new Date().getFullYear();
  const parsedSpecificDates = parseSpecificDatesInput(form.fechasEspecificas, fallbackYear);

  if (parsedSpecificDates.errors.length > 0) {
    throw new Error(parsedSpecificDates.errors[0] ?? "Hay fechas especificas invalidas.");
  }
  if (parsedSpecificDates.dates.length < 2) {
    throw new Error("Debes ingresar al menos 2 fechas especificas.");
  }
  if (parsedSpecificDates.dates.length > 50) {
    throw new Error("Zoom permite un maximo de 50 instancias por solicitud.");
  }

  if (!form.horaInicioRecurrente) {
    throw new Error("Debes completar la hora de comienzo para las fechas especificas.");
  }

  const instanceStartsIso = parsedSpecificDates.dates.map((dateIso) =>
    combineDateAndTimeToIso(dateIso, form.horaInicioRecurrente, `fecha especifica ${dateIso}`)
  );
  const firstInstanceStartIso = instanceStartsIso[0] ?? "";
  const { endIso: firstInstanceEndIso } = resolveEndByTimeOrDuration(
    firstInstanceStartIso,
    form.horaFinRecurrente,
    form.duracionRecurrente,
    "las fechas especificas"
  );

  const dateFormatter = new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const fechasLabel = parsedSpecificDates.dates
    .map((dateIso) => dateFormatter.format(new Date(`${dateIso}T00:00:00`)))
    .join(", ");

  return {
    ...buildSharedPayloadFields(input, form.descripcionRecurrente),
    tipoInstancias: "MULTIPLE_NO_COMPATIBLE_ZOOM",
    meetingIdEstrategia: "UNICO_PREFERIDO",
    fechaInicioSolicitada: firstInstanceStartIso,
    fechaFinSolicitada: firstInstanceEndIso,
    regimenEncuentros: `Fechas puntuales: ${fechasLabel}`,
    fechasInstancias: instanceStartsIso,
    instanciasDetalle: instanceStartsIso.map((inicioProgramadoAt) => ({
      inicioProgramadoAt
    }))
  };
}

export function buildDocenteSolicitudPayload(
  input: BuildDocenteSolicitudPayloadInput
): SubmitDocenteSolicitudPayload {
  if (input.form.unaOVarias === "UNA") {
    return buildSingleSolicitudPayload(input);
  }

  if (input.form.variasModo === "FECHAS_ESPECIFICAS") {
    return buildSpecificDatesSolicitudPayload(input);
  }

  return buildRecurringSolicitudPayload(input);
}
