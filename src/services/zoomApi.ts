export type ZoomAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  type: number | null;
  status: string;
  pendingEventsCount: number;
  pendingEvents: Array<{
    id: string;
    meetingId: string | null;
    occurrenceId: string | null;
    topic: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    timezone: string;
    joinUrl: string;
    status: string;
    meetingType: number | null;
    meetingKind: "UNICA" | "RECURRENTE";
  }>;
  overlapCount: number;
  overlappingEventIds: string[];
  overlaps: Array<{
    firstEventId: string;
    secondEventId: string;
    firstStartTime: string;
    secondStartTime: string;
    overlapStartTime: string;
    overlapEndTime: string;
  }>;
};

export type ZoomUpcomingMeeting = {
  id: string;
  meetingId: string | null;
  meetingUuid: string | null;
  occurrenceId: string | null;
  topic: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  joinUrl: string;
  status: string;
  meetingType: number | null;
  meetingKind: "UNICA" | "RECURRENTE";
  accountId: string;
  accountEmail: string;
  accountName: string;
  hasAccountOverlap: boolean;
  accountOverlapCount: number;
  association: {
    linked: boolean;
    source: "SOLICITUD_PRINCIPAL" | "EVENTO_ZOOM" | null;
    solicitudId: string | null;
    solicitudTitulo: string | null;
    solicitudProgramaNombre: string | null;
    solicitudEstado: string | null;
    eventoId: string | null;
  };
};

export type ZoomPastMeeting = ZoomUpcomingMeeting;

export type ZoomPastMeetingDetails = {
  meetingId: string;
  meetingUuid: string | null;
  participantsCount: number | null;
  uniqueParticipantsCount: number | null;
  qaQuestionsCount: number | null;
  pastInstancesCount: number | null;
  durationMinutes: number | null;
  status: string | null;
  startTime: string | null;
  endTime: string | null;
};

export async function loadZoomAccounts(): Promise<{
  accounts: ZoomAccount[];
  groupName: string;
  error?: string;
}> {
  const res = await fetch("/api/v1/zoom/cuentas-disponibles", { cache: "no-store" });
  const json = (await res.json()) as {
    error?: string;
    groupName?: string;
    accounts?: ZoomAccount[];
  };
  if (!res.ok) {
    return {
      accounts: [],
      groupName: "",
      error: json.error ?? "No se pudieron cargar las cuentas Zoom."
    };
  }

  const normalizedAccounts = (json.accounts ?? [])
    .map((account) => ({
      ...account,
      overlapCount: Number.isFinite(account.overlapCount) ? account.overlapCount : 0,
      overlappingEventIds: Array.isArray(account.overlappingEventIds)
        ? account.overlappingEventIds
        : [],
      overlaps: Array.isArray(account.overlaps) ? account.overlaps : [],
      pendingEvents: [...(account.pendingEvents ?? [])]
        .map((event) => ({
          ...event,
          meetingId: typeof event.meetingId === "string" ? event.meetingId : null,
          occurrenceId: typeof event.occurrenceId === "string" ? event.occurrenceId : null,
          meetingType:
            typeof event.meetingType === "number" && Number.isFinite(event.meetingType)
              ? event.meetingType
              : null,
          meetingKind:
            event.meetingKind === "RECURRENTE"
              ? ("RECURRENTE" as const)
              : ("UNICA" as const)
        }))
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    }))
    .sort((a, b) =>
      (a.email || "").localeCompare(b.email || "", "es", { sensitivity: "base" })
    );

  return {
    accounts: normalizedAccounts,
    groupName: json.groupName ?? "",
    error: undefined
  };
}

export async function loadManualPendings(): Promise<
  Array<{ id: string; titulo: string }> | null
> {
  const res = await fetch("/api/v1/provision-manual/pendientes", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { pendings: Array<{ id: string; titulo: string }> };
  return json.pendings;
}

export async function loadZoomUpcomingMeetings(): Promise<{
  groupName: string;
  meetings: ZoomUpcomingMeeting[];
  error?: string;
}> {
  const res = await fetch("/api/v1/zoom/proximas-reuniones", { cache: "no-store" });
  const json = (await res.json()) as {
    error?: string;
    groupName?: string;
    events?: ZoomUpcomingMeeting[];
  };

  if (!res.ok) {
    return {
      groupName: "",
      meetings: [],
      error: json.error ?? "No se pudieron cargar las proximas reuniones de Zoom."
    };
  }

  const meetings = [...(json.events ?? [])]
    .map((meeting): ZoomUpcomingMeeting => ({
      ...meeting,
      meetingId: typeof meeting.meetingId === "string" ? meeting.meetingId : null,
      meetingUuid: typeof meeting.meetingUuid === "string" ? meeting.meetingUuid : null,
      occurrenceId: typeof meeting.occurrenceId === "string" ? meeting.occurrenceId : null,
      meetingType:
        typeof meeting.meetingType === "number" && Number.isFinite(meeting.meetingType)
          ? meeting.meetingType
          : null,
      meetingKind: meeting.meetingKind === "RECURRENTE" ? "RECURRENTE" : "UNICA",
      association: meeting.association?.linked
        ? {
            linked: true,
            source: meeting.association.source ?? null,
            solicitudId: meeting.association.solicitudId ?? null,
            solicitudTitulo: meeting.association.solicitudTitulo ?? null,
            solicitudProgramaNombre: meeting.association.solicitudProgramaNombre ?? null,
            solicitudEstado: meeting.association.solicitudEstado ?? null,
            eventoId: meeting.association.eventoId ?? null
          }
        : {
            linked: false,
            source: null,
            solicitudId: null,
            solicitudTitulo: null,
            solicitudProgramaNombre: null,
            solicitudEstado: null,
            eventoId: null
          }
    }))
    .sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  return {
    groupName: json.groupName ?? "",
    meetings,
    error: undefined
  };
}

export async function loadZoomPastMeetings(input?: {
  monthsBack?: number;
}): Promise<{
  groupName: string;
  meetings: ZoomPastMeeting[];
  monthsBack: number;
  canLoadMoreBack: boolean;
  error?: string;
}> {
  const params = new URLSearchParams();
  if (input?.monthsBack && Number.isFinite(input.monthsBack)) {
    params.set("monthsBack", String(Math.max(1, Math.floor(input.monthsBack))));
  }
  const query = params.toString();
  const res = await fetch(
    `/api/v1/zoom/reuniones-pasadas${query ? `?${query}` : ""}`,
    { cache: "no-store" }
  );
  const json = (await res.json()) as {
    error?: string;
    groupName?: string;
    events?: ZoomPastMeeting[];
    monthsBack?: number;
    canLoadMoreBack?: boolean;
  };

  if (!res.ok) {
    return {
      groupName: "",
      meetings: [],
      monthsBack:
        typeof json.monthsBack === "number" && Number.isFinite(json.monthsBack)
          ? Math.max(1, Math.floor(json.monthsBack))
          : 1,
      canLoadMoreBack: false,
      error: json.error ?? "No se pudieron cargar las reuniones pasadas de Zoom."
    };
  }

  const meetings = [...(json.events ?? [])]
    .map((meeting): ZoomPastMeeting => ({
      ...meeting,
      meetingId: typeof meeting.meetingId === "string" ? meeting.meetingId : null,
      meetingUuid: typeof meeting.meetingUuid === "string" ? meeting.meetingUuid : null,
      occurrenceId: typeof meeting.occurrenceId === "string" ? meeting.occurrenceId : null,
      meetingType:
        typeof meeting.meetingType === "number" && Number.isFinite(meeting.meetingType)
          ? meeting.meetingType
          : null,
      meetingKind: meeting.meetingKind === "RECURRENTE" ? "RECURRENTE" : "UNICA",
      association: meeting.association?.linked
        ? {
            linked: true,
            source: meeting.association.source ?? null,
            solicitudId: meeting.association.solicitudId ?? null,
            solicitudTitulo: meeting.association.solicitudTitulo ?? null,
            solicitudProgramaNombre: meeting.association.solicitudProgramaNombre ?? null,
            solicitudEstado: meeting.association.solicitudEstado ?? null,
            eventoId: meeting.association.eventoId ?? null
          }
        : {
            linked: false,
            source: null,
            solicitudId: null,
            solicitudTitulo: null,
            solicitudProgramaNombre: null,
            solicitudEstado: null,
            eventoId: null
          }
    }))
    .sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  return {
    groupName: json.groupName ?? "",
    meetings,
    monthsBack:
      typeof json.monthsBack === "number" && Number.isFinite(json.monthsBack)
        ? Math.max(1, Math.floor(json.monthsBack))
        : 1,
    canLoadMoreBack: Boolean(json.canLoadMoreBack),
    error: undefined
  };
}

export async function loadZoomPastMeetingDetails(input: {
  meetingId: string;
  meetingUuid?: string | null;
}): Promise<{ details: ZoomPastMeetingDetails | null; error?: string }> {
  const params = new URLSearchParams();
  params.set("meetingId", input.meetingId);
  if (input.meetingUuid) params.set("meetingUuid", input.meetingUuid);

  const res = await fetch(`/api/v1/zoom/reuniones-pasadas/detalle?${params.toString()}`, {
    cache: "no-store"
  });
  const json = (await res.json()) as {
    error?: string;
    details?: ZoomPastMeetingDetails;
  };

  if (!res.ok) {
    return {
      details: null,
      error: json.error ?? "No se pudieron cargar detalles de la reunion."
    };
  }

  return {
    details: json.details ?? null,
    error: undefined
  };
}
