export type DashboardSummary = {
  solicitudesTotales: number;
  manualPendings: number;
  eventosSinSoporte: number;
  agendaAbierta: number;
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
