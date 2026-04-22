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
  virtualMinutes: number;
  hibridaMinutes: number;
  virtualHours: number;
  hibridaHours: number;
  estimatedAmountVirtual: number;
  estimatedAmountHibrida: number;
  estimatedAmount: number;
  overrunAlerts: number;
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
  inicioProgramadoAt: string;
  finProgramadoAt: string;
  inicioRealAt: string | null;
  finRealAt: string | null;
  minutosProgramados: number;
  minutosReales: number | null;
  minutosExtraNoLiquidados: number;
  requiereRevisionAdminPorExceso: boolean;
  requiereGrabacion: boolean;
  huboGrabacion: boolean | null;
  minutos: number;
  estadoEvento: string;
  estadoEjecucion: string;
  estadoAsignacion: string;
  zoomMeetingId: string | null;
  zoomJoinUrl: string | null;
  zoomAccountEmail?: string | null;
  zoomAccountName?: string | null;
  zoomHostAccount?: string | null;
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
    totalVirtualMinutes: number;
    totalHibridaMinutes: number;
    totalVirtualHours: number;
    totalHibridaHours: number;
    totalEstimatedAmountVirtual: number;
    totalEstimatedAmountHibrida: number;
    totalEstimatedAmount: number;
    totalOverrunAlerts: number;
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

export async function loadZoomAccountPassword(hostAccount: string): Promise<{
  success: boolean;
  password?: string;
  error?: string;
}> {
  const normalized = hostAccount.trim();
  if (!normalized) {
    return {
      success: false,
      error: "Cuenta Zoom invalida."
    };
  }

  const response = await fetch("/api/v1/zoom/cuentas/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostAccount: normalized })
  });

  const payload = (await response.json()) as {
    error?: string;
    success?: boolean;
    password?: string | null;
  };

  if (!response.ok) {
    return {
      success: false,
      error: payload.error ?? "No se pudo obtener la contrasena de la cuenta Zoom."
    };
  }

  if (!payload.password) {
    return {
      success: false,
      error: payload.error ?? "No hay contrasena disponible para esta cuenta."
    };
  }

  return {
    success: true,
    password: payload.password
  };
}

function resolveFilenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

export async function downloadMonthlyAccountingReport(monthKey?: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
  const response = await fetch(`/api/v1/tarifas-asistencia/reporte-mensual${query}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    try {
      const payload = (await response.json()) as { error?: string };
      return {
        success: false,
        error: payload.error ?? "No se pudo descargar el informe mensual."
      };
    } catch {
      return {
        success: false,
        error: "No se pudo descargar el informe mensual."
      };
    }
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  const filename = resolveFilenameFromDisposition(contentDisposition) ??
    `informe-contaduria-${monthKey ?? "mensual"}.xlsx`;
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);

  return { success: true };
}
