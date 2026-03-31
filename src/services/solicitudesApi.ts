export type Solicitud = {
  id: string;
  titulo: string;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  modalidadReunion: string;
  tipoInstancias: string;
  estadoSolicitud: string;
  estadoSolicitudVista?: string;
  requestedBy?: {
    id: string;
    email: string;
    name: string;
  } | null;
  requiereAsistencia?: boolean;
  requiresAsistencia?: boolean;
  meetingPrincipalId?: string | null;
  zoomJoinUrl?: string | null;
  zoomHostAccount?: string | null;
  zoomInstanceCount?: number;
  zoomReadFromApi?: boolean;
  zoomInstances?: Array<{
    eventId?: string | null;
    occurrenceId?: string | null;
    startTime: string;
    endTime?: string;
    durationMinutes: number;
    estadoEvento?: string | null;
    estadoCobertura?: string | null;
    status?: string | null;
    joinUrl?: string | null;
    requiereAsistencia?: boolean | null;
    monitorNombre?: string | null;
    monitorEmail?: string | null;
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
  programaNombre: string | null;
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

export type DocenteSolicitudTipoInstancias =
  | "UNICA"
  | "MULTIPLE_COMPATIBLE_ZOOM"
  | "MULTIPLE_NO_COMPATIBLE_ZOOM";

export type DocenteSolicitudZoomRecurrence = {
  type: number;
  repeat_interval: number;
  weekly_days?: string;
  monthly_day?: number;
  monthly_week?: -1 | 1 | 2 | 3 | 4;
  monthly_week_day?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  end_times: number;
};

export type SubmitDocenteSolicitudPayload = {
  titulo: string;
  responsableNombre: string;
  programaNombre: string;
  descripcion: string;
  finalidadAcademica?: string;
  modalidadReunion: "VIRTUAL" | "HIBRIDA";
  tipoInstancias: DocenteSolicitudTipoInstancias;
  meetingIdEstrategia?: "UNICO_REQUERIDO" | "UNICO_PREFERIDO" | "MULTIPLE_PERMITIDO";
  fechaInicioSolicitada: string;
  fechaFinSolicitada: string;
  fechaFinRecurrencia?: string;
  timezone: string;
  docentesCorreos?: string;
  grabacionPreferencia: "SI" | "NO" | "A_DEFINIR";
  requiereGrabacion: boolean;
  requiereAsistencia: boolean;
  motivoAsistencia?: string;
  regimenEncuentros?: string;
  fechasInstancias?: string[];
  instanciasDetalle?: Array<{ inicioProgramadoAt: string }>;
  patronRecurrencia?: {
    totalInstancias: number;
    fechaFinal: string;
    zoomRecurrence: DocenteSolicitudZoomRecurrence;
  };
};

type RequestJsonResult<T> = {
  ok: boolean;
  data: T;
};

type CancelScope = "SERIE" | "INSTANCIA";

type CancelSolicitudResult<TScope extends CancelScope> = {
  scope: TScope;
  solicitudId: string;
  eventoId?: string;
  occurrenceId?: string | null;
  zoomMeetingId?: string | null;
  cancelledInZoom?: boolean;
  updatedEvents?: number;
  activeEvents?: number;
};

type CancelSolicitudResponse<TScope extends CancelScope> = {
  success: boolean;
  error?: string;
  result?: CancelSolicitudResult<TScope>;
};

type RestoreSolicitudInstanciaResult = {
  solicitudId: string;
  eventoId: string;
  zoomMeetingId?: string | null;
  occurrenceId?: string | null;
  source?: string;
  usedPrimaryMeeting?: boolean;
  activeEvents?: number;
};

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<RequestJsonResult<T>> {
  const response = await fetch(input, init);
  const text = await response.text().catch(() => "");
  let parsed = {} as T;

  if (text) {
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      parsed = {} as T;
    }
  }

  return {
    ok: response.ok,
    data: parsed
  };
}

function withJsonBody(payload: unknown): Pick<RequestInit, "headers" | "body"> {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  };
}

export async function loadSolicitudes(): Promise<Solicitud[] | null> {
  const result = await requestJson<{ requests?: Solicitud[] }>("/api/v1/solicitudes-sala", {
    cache: "no-store"
  });
  if (!result.ok) return null;
  return result.data.requests ?? [];
}

export async function loadPastMeetings(): Promise<PastMeeting[] | null> {
  const result = await requestJson<{ meetings?: PastMeeting[] }>("/api/v1/reuniones-pasadas", {
    cache: "no-store"
  });
  if (!result.ok) return null;
  return result.data.meetings ?? [];
}

export async function submitDocenteSolicitud(payload: SubmitDocenteSolicitudPayload): Promise<{
  success: boolean;
  requestId?: string;
  error?: string;
}> {
  const result = await requestJson<{ error?: string; request?: { id: string } }>(
    "/api/v1/solicitudes-sala",
    {
    method: "POST",
      ...withJsonBody(payload)
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo crear la solicitud."
    };
  }

  return {
    success: true,
    requestId: result.data.request?.id
  };
}

export async function submitPastMeeting(payload: Record<string, unknown>): Promise<{
  success: boolean;
  solicitudId?: string;
  error?: string;
}> {
  const result = await requestJson<{ error?: string; result?: { solicitudId: string } }>(
    "/api/v1/reuniones-pasadas",
    {
      method: "POST",
      ...withJsonBody(payload)
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo registrar la reunion pasada."
    };
  }

  return {
    success: true,
    solicitudId: result.data.result?.solicitudId
  };
}

export async function updatePastMeeting(input: {
  eventoId: string;
  programaNombre: string;
  monitorEmail?: string;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  const result = await requestJson<{ error?: string }>(
    `/api/v1/reuniones-pasadas/${encodeURIComponent(input.eventoId)}`,
    {
      method: "PATCH",
      ...withJsonBody({
        programaNombre: input.programaNombre,
        monitorEmail: input.monitorEmail
      })
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo actualizar la reunion."
    };
  }

  return { success: true };
}

export async function deleteSolicitud(solicitudId: string): Promise<{
  success: boolean;
  requestId?: string;
  zoomMeetingId?: string | null;
  deletedInZoom?: boolean;
  error?: string;
}> {
  const result = await requestJson<{
    error?: string;
    result?: {
      id: string;
      zoomMeetingId?: string | null;
      deletedInZoom?: boolean;
    };
  }>(`/api/v1/solicitudes-sala/${encodeURIComponent(solicitudId)}`, {
    method: "DELETE"
  });

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo eliminar la solicitud."
    };
  }

  return {
    success: true,
    requestId: result.data.result?.id,
    zoomMeetingId: result.data.result?.zoomMeetingId ?? null,
    deletedInZoom: result.data.result?.deletedInZoom ?? false
  };
}

async function cancelSolicitud<TScope extends CancelScope>(
  payload: Record<string, unknown>,
  defaultErrorMessage: string
): Promise<CancelSolicitudResponse<TScope>> {
  const solicitudId = String(payload.solicitudId ?? "");
  const result = await requestJson<{ error?: string; result?: CancelSolicitudResult<TScope> }>(
    `/api/v1/solicitudes-sala/${encodeURIComponent(solicitudId)}/cancelar`,
    {
      method: "POST",
      ...withJsonBody(payload)
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? defaultErrorMessage
    };
  }

  return {
    success: true,
    result: result.data.result
  };
}

export async function cancelSolicitudSerie(
  solicitudId: string,
  motivo?: string
): Promise<CancelSolicitudResponse<"SERIE">> {
  return cancelSolicitud<"SERIE">(
    {
      solicitudId,
      scope: "SERIE",
      motivo
    },
    "No se pudo cancelar la serie."
  );
}

export async function cancelSolicitudInstancia(input: {
  solicitudId: string;
  eventoId?: string;
  occurrenceId?: string | null;
  inicioProgramadoAt?: string;
  motivo?: string;
}): Promise<CancelSolicitudResponse<"INSTANCIA">> {
  return cancelSolicitud<"INSTANCIA">(
    {
      solicitudId: input.solicitudId,
      scope: "INSTANCIA",
      eventoId: input.eventoId,
      occurrenceId: input.occurrenceId,
      inicioProgramadoAt: input.inicioProgramadoAt,
      motivo: input.motivo
    },
    "No se pudo cancelar la instancia."
  );
}

export async function restoreSolicitudInstancia(input: {
  solicitudId: string;
  eventoId?: string;
  inicioProgramadoAt?: string;
  motivo?: string;
}): Promise<{
  success: boolean;
  result?: RestoreSolicitudInstanciaResult;
  error?: string;
}> {
  const result = await requestJson<{
    error?: string;
    result?: RestoreSolicitudInstanciaResult;
  }>(
    `/api/v1/solicitudes-sala/${encodeURIComponent(input.solicitudId)}/instancias/restaurar`,
    {
      method: "POST",
      ...withJsonBody({
        eventoId: input.eventoId,
        inicioProgramadoAt: input.inicioProgramadoAt,
        motivo: input.motivo
      })
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo descancelar la instancia."
    };
  }

  return {
    success: true,
    result: result.data.result
  };
}

export async function sendSolicitudReminder(input: {
  solicitudId: string;
  toEmail?: string;
  mensaje?: string;
}): Promise<{
  success: boolean;
  sentTo?: string;
  error?: string;
}> {
  const result = await requestJson<{
    error?: string;
    result?: { sentTo?: string };
  }>(
    `/api/v1/solicitudes-sala/${encodeURIComponent(input.solicitudId)}/recordatorio`,
    {
      method: "POST",
      ...withJsonBody({
        toEmail: input.toEmail,
        mensaje: input.mensaje
      })
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo enviar el recordatorio."
    };
  }

  return {
    success: true,
    sentTo: result.data.result?.sentTo
  };
}

export async function enableSolicitudAsistencia(input: {
  solicitudId: string;
  motivo?: string;
}): Promise<{
  success: boolean;
  updatedEvents?: number;
  alreadyEnabled?: boolean;
  error?: string;
}> {
  const result = await requestJson<{
    error?: string;
    result?: {
      updatedEvents?: number;
      alreadyEnabled?: boolean;
    };
  }>(`/api/v1/solicitudes-sala/${encodeURIComponent(input.solicitudId)}`, {
    method: "PATCH",
    ...withJsonBody({
      motivo: input.motivo
    })
  });

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo habilitar asistencia Zoom."
    };
  }

  return {
    success: true,
    updatedEvents: result.data.result?.updatedEvents,
    alreadyEnabled: result.data.result?.alreadyEnabled
  };
}

export async function addSolicitudInstancia(input: {
  solicitudId: string;
  inicioProgramadoAt: string;
  finProgramadoAt: string;
}): Promise<{
  success: boolean;
  result?: {
    solicitudId: string;
    eventoId: string;
    cantidadInstancias: number;
    usaMeetingPrincipal?: boolean;
    zoomMeetingId?: string | null;
  };
  error?: string;
}> {
  const result = await requestJson<{
    error?: string;
    result?: {
      solicitudId: string;
      eventoId: string;
      cantidadInstancias: number;
      usaMeetingPrincipal?: boolean;
      zoomMeetingId?: string | null;
    };
  }>(
    `/api/v1/solicitudes-sala/${encodeURIComponent(input.solicitudId)}/instancias`,
    {
      method: "POST",
      ...withJsonBody({
        inicioProgramadoAt: input.inicioProgramadoAt,
        finProgramadoAt: input.finProgramadoAt
      })
    }
  );

  if (!result.ok) {
    return {
      success: false,
      error: result.data.error ?? "No se pudo agregar la instancia."
    };
  }

  return {
    success: true,
    result: result.data.result
  };
}
