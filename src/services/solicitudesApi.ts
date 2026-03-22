export type Solicitud = {
  id: string;
  titulo: string;
  modalidadReunion: string;
  tipoInstancias: string;
  estadoSolicitud: string;
  requestedBy?: {
    id: string;
    email: string;
    name: string;
  } | null;
  requiresAsistencia?: boolean;
  meetingPrincipalId?: string | null;
  zoomJoinUrl?: string | null;
  zoomInstanceCount?: number;
  zoomReadFromApi?: boolean;
  zoomInstances?: Array<{
    occurrenceId?: string | null;
    startTime: string;
    durationMinutes: number;
    status?: string | null;
    joinUrl?: string | null;
  }>;
  cuentaZoomAsignada?: {
    id: string;
    nombreCuenta?: string | null;
    ownerEmail?: string | null;
  } | null;
  createdAt: string;
};

export type PastMeeting = {
  id: string;
  solicitudId: string;
  titulo: string;
  modalidadReunion: string;
  zoomMeetingId: string;
  zoomJoinUrl: string | null;
  inicioAt: string;
  finAt: string;
  minutosReales: number;
  estadoEvento: string;
  estadoEjecucion: string;
  docenteNombre: string;
  docenteEmail: string;
  monitorNombre: string | null;
  monitorEmail: string | null;
};

export async function loadSolicitudes(): Promise<Solicitud[] | null> {
  const res = await fetch("/api/v1/solicitudes-sala", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { requests: Solicitud[] };
  return json.requests;
}

export async function loadPastMeetings(): Promise<PastMeeting[] | null> {
  const res = await fetch("/api/v1/reuniones-pasadas", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { meetings: PastMeeting[] };
  return json.meetings;
}

export async function submitDocenteSolicitud(payload: Record<string, unknown>): Promise<{
  success: boolean;
  requestId?: string;
  error?: string;
}> {
  const response = await fetch("/api/v1/solicitudes-sala", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { error?: string; request?: { id: string } };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo crear la solicitud."
    };
  }
  return {
    success: true,
    requestId: data.request?.id
  };
}

export async function submitPastMeeting(payload: Record<string, unknown>): Promise<{
  success: boolean;
  solicitudId?: string;
  error?: string;
}> {
  const response = await fetch("/api/v1/reuniones-pasadas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { error?: string; result?: { solicitudId: string } };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo registrar la reunion pasada."
    };
  }

  return {
    success: true,
    solicitudId: data.result?.solicitudId
  };
}
