export type DashboardAccountingAssistantSummary = {
  asistenteZoomId: string;
  asistenteNombre: string;
  asistenteEmail: string;
  horasVirtuales: number;
  horasPresenciales: number;
  horasTotales: number;
  reunionesVirtuales: number;
  reunionesPresenciales: number;
  reunionesTotales: number;
};

export type DashboardNextMeeting = {
  id: string;
  titulo: string;
  programaNombre: string | null;
  modalidad: string;
  startTime: string;
  endTime: string;
  zoomJoinUrl: string | null;
  zoomMeetingId: string | null;
  requiresAssistance: boolean;
  hostAccount: string | null;
  hostPassword: string | null;
  instanceIndex?: number;
  totalInstances?: number;
  asistente: {
    nombre: string;
    email: string;
  } | null;
};

export type DashboardSummary = {
  scope: "ADMINISTRADOR" | "DOCENTE" | "ASISTENTE_ZOOM" | "CONTADURIA";
  solicitudesTotales?: number;
  solicitudesActivas?: number;
  proximasReuniones?: number;
  reunionesConZoom?: number;
  manualPendings?: number;
  solicitudesNoResueltas?: number;
  colisionesZoom7d?: number;
  eventosSinAsistencia7d?: number;
  eventosSinCobertura?: number;
  agendaAbierta?: number;
  eventosCriticosSinAsistencia?: number;
  eventosCriticosSinLinkZoom?: number;
  agendaDisponible?: number;
  misPostulaciones?: number;
  misAsignacionesProximas?: number;
  misHorasMes?: number;
  misHorasVirtualesMes?: number;
  misHorasPresencialesMes?: number;
  misHorasMesAnterior?: number;
  misHorasVirtualesMesAnterior?: number;
  misHorasPresencialesMesAnterior?: number;
  reunionesCompletadasMes?: number;
  horasCompletadasMes?: number;
  personasActivasMes?: number;
  horasVirtualesMes?: number;
  horasPresencialesMes?: number;
  contaduriaHorasPorAsistente?: DashboardAccountingAssistantSummary[];
  nextMeeting?: DashboardNextMeeting | null;
};

export async function loadSummary(): Promise<DashboardSummary | null> {
  const res = await fetch("/api/v1/dashboard", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { summary: DashboardSummary };
  return json.summary;
}

export type AssignmentBoardEvent = {
  id: string;
  inicioProgramadoAt: string;
  finProgramadoAt: string;
  modalidadReunion: string;
  estadoCobertura?: string;
  zoomMeetingId?: string | null;
  zoomJoinUrl?: string | null;
  cuentaZoom?: {
    nombreCuenta?: string | null;
    ownerEmail?: string | null;
  } | null;
  currentAssignment?: {
    asistenteZoomId: string;
    estadoAsignacion: string;
    email: string;
    nombre: string;
  } | null;
  solicitud: {
    id: string;
    titulo: string;
    modalidadReunion: string;
    programaNombre?: string | null;
    responsableNombre?: string | null;
    docente?: {
      usuario?: {
        email?: string | null;
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    } | null;
  };
  interesados: Array<{
    asistenteZoomId: string;
    email: string;
    nombre: string;
  }>;
};

export type AssignableAssistant = {
  id: string;
  email: string;
  nombre: string;
};

export type AssignmentSuggestion = {
  sessionId: string;
  scopeKey: string;
  score: number;
  events: Array<{
    eventoId: string;
    titulo: string;
    inicioProgramadoAt: string;
    finProgramadoAt: string;
    modalidadReunion: string;
    coverageValue: number;
    asistenteZoomId: string | null;
    asistenteNombre: string | null;
    asistenteEmail: string | null;
  }>;
  assistants: Array<{
    asistenteZoomId: string;
    asistenteNombre: string;
    asistenteEmail: string;
    baseValue: number;
    suggestedValue: number;
    projectedValue: number;
  }>;
};

export async function loadAssignmentBoard(): Promise<{
  events: AssignmentBoardEvent[];
  assistants: AssignableAssistant[];
} | null> {
  const res = await fetch("/api/v1/asignacion-personal/pendientes", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    events: AssignmentBoardEvent[];
    assistants: AssignableAssistant[];
  };
  return {
    events: json.events ?? [],
    assistants: json.assistants ?? []
  };
}

export async function loadAssignmentSuggestion(monthKey?: string): Promise<{
  sessionId: string | null;
  scopeKey: string;
  suggestion: AssignmentSuggestion | null;
  message?: string | null;
} | null> {
  const qs = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
  const res = await fetch(`/api/v1/asignacion-personal/sugerencias${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    sessionId: string | null;
    scopeKey: string;
    suggestion: AssignmentSuggestion | null;
    message?: string | null;
  };
  return json;
}

export async function loadNextAssignmentSuggestion(sessionId: string): Promise<{
  sessionId: string;
  scopeKey: string;
  suggestion: AssignmentSuggestion | null;
  message?: string | null;
} | null> {
  const res = await fetch("/api/v1/asignacion-personal/sugerencias/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    sessionId: string;
    scopeKey: string;
    suggestion: AssignmentSuggestion | null;
    message?: string | null;
  };
  return json;
}
