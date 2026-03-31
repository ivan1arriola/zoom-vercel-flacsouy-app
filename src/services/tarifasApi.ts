export type Tarifa = {
  id: string;
  modalidadReunion: string;
  valorHora: string;
  moneda: string;
  estado?: string;
  vigenteDesde?: string;
};

export type PersonHoursPerson = {
  userId: string;
  email: string;
  role: string;
  nombre: string;
  hasAssistantProfile: boolean;
};

export type PersonHoursMonthSummary = {
  monthKey: string;
  year: number;
  month: number;
  meetingsCount: number;
  totalMinutes: number;
  totalHours: number;
};

export type PersonHoursMeeting = {
  assignmentId: string;
  eventId: string;
  solicitudId: string;
  titulo: string;
  programaNombre: string | null;
  modalidadReunion: string;
  inicioAt: string;
  finAt: string;
  minutos: number;
  estadoEvento: string;
  estadoEjecucion: string;
  estadoAsignacion: string;
  zoomMeetingId: string | null;
  zoomJoinUrl: string | null;
  isCompleted: boolean;
};

export type PersonHoursResponse = {
  people: PersonHoursPerson[];
  selectedUserId: string | null;
  selectedPerson: PersonHoursPerson | null;
  totals: {
    meetingsTotal: number;
    completedMeetingsTotal: number;
    completedMinutesTotal: number;
    completedHoursTotal: number;
  };
  monthSummaries: PersonHoursMonthSummary[];
  meetings: PersonHoursMeeting[];
  availableMonthKeys?: string[];
  assistantSummaries?: Array<{
    userId: string;
    email: string;
    role: string;
    nombre: string;
    hasAssistantProfile: boolean;
    totalCompletedMeetings: number;
    totalCompletedMinutes: number;
    totalCompletedHours: number;
    months: PersonHoursMonthSummary[];
  }>;
};

export async function loadTarifas(): Promise<Tarifa[] | null> {
  const res = await fetch("/api/v1/tarifas-asistencia", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    rates: Array<{
      id: string;
      modalidadReunion: string;
      valorHora: string;
      moneda: string;
      estado?: string;
      vigenteDesde?: string;
    }>;
  };
  return json.rates;
}

export async function submitTarifaUpdate(payload: Record<string, unknown>): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/tarifas-asistencia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo actualizar la tarifa."
    };
  }
  return { success: true };
}

export async function loadPersonHours(userId?: string): Promise<PersonHoursResponse | null> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const res = await fetch(`/api/v1/tarifas-asistencia/personas${query}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as PersonHoursResponse;
  return json;
}
