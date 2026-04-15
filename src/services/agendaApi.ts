export type AgendaEvent = {
  id: string;
  inicioProgramadoAt: string;
  finProgramadoAt: string;
  zoomMeetingId?: string | null;
  zoomJoinUrl?: string | null;
  cuentaZoom?: {
    nombreCuenta?: string | null;
    ownerEmail?: string | null;
  } | null;
  solicitud: {
    titulo: string;
    modalidadReunion: string;
    programaNombre?: string | null;
    responsableNombre?: string | null;
    patronRecurrencia?: Record<string, unknown> | null;
    docente?: {
      usuario?: {
        email?: string | null;
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    } | null;
  };
  asignaciones?: Array<{
    asistente?: {
      usuario?: {
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
      } | null;
    } | null;
  }>;
  intereses: Array<{
    id: string;
    estadoInteres: string;
    fechaRespuestaAt?: string | null;
  }>;
};

export async function loadAgendaLibre(): Promise<AgendaEvent[] | null> {
  const res = await fetch("/api/v1/agenda-soporte/abierta", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { agenda: AgendaEvent[] };
  return json.agenda;
}

export async function setInterest(
  eventoId: string,
  estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA" | "RETIRADO"
): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch(`/api/v1/eventos-zoom/${eventoId}/intereses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estadoInteres })
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo registrar interés."
    };
  }
  return { success: true };
}

export async function assignAssistantToEvent(
  eventoId: string,
  asistenteZoomId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch(`/api/v1/eventos-zoom/${eventoId}/asignaciones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asistenteZoomId })
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo asignar asistencia."
    };
  }
  return { success: true };
}
