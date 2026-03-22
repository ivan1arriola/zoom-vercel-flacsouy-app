import type { ZoomAccount } from "@/src/services/zoomApi";

export function isLicensedZoomAccount(account: ZoomAccount): boolean {
  return account.type === 2;
}

export function isMeetingStartingSoon(startTime: string): boolean {
  const startMs = new Date(startTime).getTime();
  if (Number.isNaN(startMs)) return false;
  const diff = startMs - Date.now();
  const hours24 = 24 * 60 * 60 * 1000;
  return diff >= 0 && diff <= hours24;
}

export function formatDurationHoursMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function formatZoomDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(",", "");
}

export function formatManagedUserRole(role: string): string {
  if (role === "ADMINISTRADOR") return "Administrador";
  if (role === "CONTADURIA") return "Contaduria";
  if (role === "SOPORTE_ZOOM") return "Soporte Zoom";
  if (role === "ASISTENTE_ZOOM") return "Asistente Zoom";
  if (role === "DOCENTE") return "Docente";
  return role;
}

export function formatManagedUserDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(",", "");
}

export function formatModalidad(value: string): string {
  return value === "HIBRIDA" ? "Presencial" : "Virtual";
}

export function normalizeZoomMeetingId(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

export function resolveZoomJoinUrl(joinUrl?: string | null, meetingId?: string | null): string | null {
  if (joinUrl) {
    try {
      const parsed = new URL(joinUrl);
      const host = parsed.hostname.toLowerCase();
      if (host.includes("zoom.us")) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        const roomTypeIndex = parts.findIndex((part) => part === "j" || part === "w");
        if (roomTypeIndex >= 0 && parts[roomTypeIndex + 1]) {
          const normalizedId = normalizeZoomMeetingId(parts[roomTypeIndex + 1]);
          return normalizedId ? `https://zoom.us/j/${normalizedId}` : null;
        }
        return joinUrl;
      }
    } catch {
      // ignore and fallback
    }
  }

  const normalizedMeetingId = normalizeZoomMeetingId(meetingId);
  if (!normalizedMeetingId) return null;
  return `https://zoom.us/j/${normalizedMeetingId}`;
}

export function getPreparacionDisplay(item: { solicitud: { modalidadReunion: string; patronRecurrencia?: Record<string, unknown> | null } }): string {
  if (item.solicitud.modalidadReunion !== "HIBRIDA") return "";
  const prep = item.solicitud.patronRecurrencia?.["preparacionMinutos"];
  if (typeof prep !== "number" || prep <= 0) return "";
  const hours = Math.floor(prep / 60);
  const rest = prep % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function getAssignedPerson(item: {
  asignaciones?: Array<{ asistente?: { usuario?: { name?: string; firstName?: string; lastName?: string; email?: string } } }>;
}): string {
  const assigned = item.asignaciones?.[0]?.asistente?.usuario;
  if (!assigned) return "";
  return (
    assigned.name || [assigned.firstName, assigned.lastName].filter(Boolean).join(" ") || assigned.email || ""
  );
}

export function getEncargado(item: {
  solicitud: { docente?: { usuario?: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null } | null } | null };
}): string {
  const docente = item.solicitud.docente?.usuario;
  if (!docente) return "";
  return docente.name || [docente.firstName, docente.lastName].filter(Boolean).join(" ") || docente.email || "";
}
