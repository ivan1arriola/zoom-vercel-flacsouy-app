/**
 * Form validators and transformers for Solicitud (Zoom Room Request) forms
 * Consolidates validation logic and data transformation
 */

export function toIso(value: string, fieldName: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} invalida.`);
  }
  return parsed.toISOString();
}

export function combineDateAndTimeToIso(day: string, time: string, fieldName: string): string {
  if (!day || !time) {
    throw new Error(`Debes completar ${fieldName}.`);
  }
  return toIso(`${day}T${time}`, fieldName);
}

export interface ResolvedEndTime {
  endIso: string;
  durationMinutes: number;
}

export function resolveEndByTimeOrDuration(
  startIso: string,
  endTime: string,
  durationValue: string,
  contextLabel: string
): ResolvedEndTime {
  const startDate = new Date(startIso);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Inicio de ${contextLabel} invalido.`);
  }

  if (!endTime && !durationValue) {
    throw new Error(`Debes completar hora de fin o duracion para ${contextLabel}.`);
  }

  if (endTime) {
    const [hoursText, minutesText] = endTime.split(":");
    const hours = Number(hoursText);
    const minutes = Number(minutesText);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      throw new Error(`Hora de fin de ${contextLabel} invalida.`);
    }

    const endDate = new Date(startDate);
    endDate.setHours(hours, minutes, 0, 0);
    if (endDate <= startDate) {
      throw new Error(`La hora de fin debe ser posterior al inicio en ${contextLabel}.`);
    }

    const durationMinutes = Math.floor((endDate.getTime() - startDate.getTime()) / 60000);
    return { endIso: endDate.toISOString(), durationMinutes };
  }

  const durationMinutes = Number(durationValue.replace(",", "."));
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error(`Duracion de ${contextLabel} invalida.`);
  }

  const normalizedDuration = Math.floor(durationMinutes);
  return {
    endIso: new Date(startDate.getTime() + normalizedDuration * 60_000).toISOString(),
    durationMinutes: normalizedDuration
  };
}

export function validateSolicitudTema(tema: string): void {
  if (!tema.trim()) {
    throw new Error("Debes completar el tema.");
  }
}

export function validatePastMeetingRequired(titulo: string, docenteEmail: string, inicioRealAt: string, finRealAt: string): void {
  if (!titulo.trim()) {
    throw new Error("Debes completar el titulo.");
  }
  if (!docenteEmail.trim()) {
    throw new Error("Debes completar el email del docente.");
  }
  if (!inicioRealAt) {
    throw new Error("Debes completar la fecha/hora de inicio real.");
  }
  if (!finRealAt) {
    throw new Error("Debes completar la fecha/hora de fin real.");
  }
}

export function validateTarifaUpdate(modalidadReunion: string, valorHora: string): void {
  if (!modalidadReunion) {
    throw new Error("Debes seleccionar una modalidad.");
  }
  const valor = Number(valorHora);
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("El valor por hora debe ser un número válido.");
  }
}

export function validateUserCreation(email: string): void {
  if (!email.trim()) {
    throw new Error("Debes completar el email.");
  }
}

