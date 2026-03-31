import type { ZoomAccount } from "@/src/services/zoomApi";

type ZoomAccountColor = {
  background: string;
  text: string;
  border: string;
};

const ZOOM_ACCOUNT_COLORS: ZoomAccountColor[] = [
  { background: "#fde2e4", text: "#7a1e2c", border: "#f4a6b3" },
  { background: "#e2f0ff", text: "#164b7a", border: "#9fc6f0" },
  { background: "#e5f7eb", text: "#1f5f33", border: "#9fd7ae" },
  { background: "#fff1dc", text: "#7a4c14", border: "#f0c68a" },
  { background: "#efe8ff", text: "#4a2a7a", border: "#c6b3f0" },
  { background: "#e6fbfa", text: "#0f5b57", border: "#98dbd7" },
  { background: "#ffe4f0", text: "#7a1f4d", border: "#f1a9cb" },
  { background: "#eef7d8", text: "#4c5f1b", border: "#c9de8a" },
  { background: "#e8edf2", text: "#2f465d", border: "#b3c1cf" },
  { background: "#ffe8df", text: "#7a3620", border: "#f0b79d" },
  { background: "#e6e6ff", text: "#2f2f7a", border: "#b0b0f0" },
  { background: "#e5f5ff", text: "#1a537a", border: "#9bcdf0" },
  { background: "#fff7d6", text: "#6e5a12", border: "#e6cf7c" },
  { background: "#e2fff4", text: "#1a6147", border: "#9ad9c1" },
  { background: "#f7e8e2", text: "#6d3423", border: "#d9b0a3" },
  { background: "#ebe9ff", text: "#3f2f7a", border: "#bdb4f0" },
  { background: "#e8f8ff", text: "#15536e", border: "#a1d2e6" },
  { background: "#f2ffe6", text: "#3d5f1f", border: "#bada9e" },
  { background: "#ffe9e9", text: "#7a2323", border: "#e6a8a8" },
  { background: "#e6f2ff", text: "#1e4770", border: "#a7c5e6" }
];

function hashAccountKey(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getZoomAccountColor(accountKey?: string | null): ZoomAccountColor {
  const normalizedKey = (accountKey ?? "").trim().toLowerCase();
  if (!normalizedKey) return ZOOM_ACCOUNT_COLORS[0];
  const index = hashAccountKey(normalizedKey) % ZOOM_ACCOUNT_COLORS.length;
  return ZOOM_ACCOUNT_COLORS[index] ?? ZOOM_ACCOUNT_COLORS[0];
}

export function buildZoomAccountColorMap(
  accountKeys: Array<string | null | undefined>
): Map<string, ZoomAccountColor> {
  const uniqueKeys = Array.from(
    new Set(
      accountKeys
        .map((key) => (key ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "es"));

  const colorMap = new Map<string, ZoomAccountColor>();
  const usedIndexes = new Set<number>();

  for (const key of uniqueKeys) {
    const baseIndex = hashAccountKey(key) % ZOOM_ACCOUNT_COLORS.length;
    let resolvedIndex = baseIndex;
    let attempts = 0;

    while (usedIndexes.has(resolvedIndex) && attempts < ZOOM_ACCOUNT_COLORS.length) {
      resolvedIndex = (resolvedIndex + 1) % ZOOM_ACCOUNT_COLORS.length;
      attempts += 1;
    }

    if (attempts >= ZOOM_ACCOUNT_COLORS.length) {
      resolvedIndex = baseIndex;
    }

    usedIndexes.add(resolvedIndex);
    colorMap.set(key, ZOOM_ACCOUNT_COLORS[resolvedIndex] ?? ZOOM_ACCOUNT_COLORS[0]);
  }

  return colorMap;
}

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

export function formatZoomDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

export function formatZoomTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

export function formatDurationHuman(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "-";
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hoursLabel = hours === 1 ? "hora" : "horas";
  const minutesLabel = minutes === 1 ? "minuto" : "minutos";
  return `${hours} ${hoursLabel} y ${minutes} ${minutesLabel}`;
}

export function formatManagedUserRole(role: string): string {
  if (role === "ADMINISTRADOR") return "Administrador";
  if (role === "CONTADURIA") return "Contaduria";
  if (role === "SOPORTE_ZOOM" || role === "ASISTENTE_ZOOM") return "Asistente Zoom";
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
