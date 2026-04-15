import { db } from "@/src/lib/db";

export type ZoomMeetingAssociationSource = "SOLICITUD_PRINCIPAL" | "EVENTO_ZOOM";

export type ZoomMeetingAssociation = {
  linked: boolean;
  source: ZoomMeetingAssociationSource | null;
  solicitudId: string | null;
  solicitudTitulo: string | null;
  solicitudProgramaNombre: string | null;
  solicitudEstado: string | null;
  eventoId: string | null;
  requiresAssistance: boolean | null;
  assistantName: string | null;
  assistantEmail: string | null;
  assistantStatus: "NO_APLICA" | "PENDIENTE" | "ASIGNADO";
};

function resolveAssistantStatus(input: {
  requiresAssistance?: boolean | null;
  assistantName?: string | null;
  assistantEmail?: string | null;
}): "NO_APLICA" | "PENDIENTE" | "ASIGNADO" {
  if (input.requiresAssistance === false) return "NO_APLICA";
  const hasAssistant = Boolean((input.assistantName ?? "").trim() || (input.assistantEmail ?? "").trim());
  if (hasAssistant) return "ASIGNADO";
  return "PENDIENTE";
}

export function normalizeZoomMeetingId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

export function extractZoomMeetingIdFromJoinUrl(joinUrl: unknown): string | null {
  if (typeof joinUrl !== "string" || !joinUrl.trim()) return null;
  try {
    const parsed = new URL(joinUrl);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("zoom.us")) return null;

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const roomIndex = pathParts.findIndex((part) => part === "j" || part === "w");
    if (roomIndex < 0 || !pathParts[roomIndex + 1]) return null;
    return normalizeZoomMeetingId(pathParts[roomIndex + 1]);
  } catch {
    return null;
  }
}

export function buildUnlinkedZoomMeetingAssociation(): ZoomMeetingAssociation {
  return {
    linked: false,
    source: null,
    solicitudId: null,
    solicitudTitulo: null,
    solicitudProgramaNombre: null,
    solicitudEstado: null,
    eventoId: null,
    requiresAssistance: null,
    assistantName: null,
    assistantEmail: null,
    assistantStatus: "PENDIENTE"
  };
}

export async function resolveZoomMeetingAssociations(
  rawMeetingIds: Array<string | null | undefined>
): Promise<Map<string, ZoomMeetingAssociation>> {
  const normalizedMeetingIds = Array.from(
    new Set(
      rawMeetingIds
        .map((value) => normalizeZoomMeetingId(value))
        .filter((value): value is string => Boolean(value))
    )
  );

  const associations = new Map<string, ZoomMeetingAssociation>();
  if (normalizedMeetingIds.length === 0) {
    return associations;
  }

  const [solicitudes, eventos] = await Promise.all([
    db.solicitudSala.findMany({
      where: { meetingPrincipalId: { in: normalizedMeetingIds } },
      select: {
        id: true,
        titulo: true,
        programaNombre: true,
        estadoSolicitud: true,
        meetingPrincipalId: true,
        requiereAsistencia: true
      },
      orderBy: { createdAt: "desc" }
    }),
    db.eventoZoom.findMany({
      where: { zoomMeetingId: { in: normalizedMeetingIds } },
      select: {
        id: true,
        requiereAsistencia: true,
        zoomMeetingId: true,
        asignaciones: {
          where: {
            tipoAsignacion: "PRINCIPAL",
            estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            asistente: {
              select: {
                usuario: {
                  select: {
                    name: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          }
        },
        solicitud: {
          select: {
            id: true,
            titulo: true,
            programaNombre: true,
            estadoSolicitud: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  for (const solicitud of solicitudes) {
    const meetingId = normalizeZoomMeetingId(solicitud.meetingPrincipalId);
    if (!meetingId || associations.has(meetingId)) continue;

    const assistantStatus = resolveAssistantStatus({
      requiresAssistance: solicitud.requiereAsistencia,
      assistantName: null,
      assistantEmail: null
    });

    associations.set(meetingId, {
      linked: true,
      source: "SOLICITUD_PRINCIPAL",
      solicitudId: solicitud.id,
      solicitudTitulo: solicitud.titulo,
      solicitudProgramaNombre: solicitud.programaNombre ?? null,
      solicitudEstado: solicitud.estadoSolicitud,
      eventoId: null,
      requiresAssistance: solicitud.requiereAsistencia,
      assistantName: null,
      assistantEmail: null,
      assistantStatus
    });
  }

  for (const evento of eventos) {
    const meetingId = normalizeZoomMeetingId(evento.zoomMeetingId);
    if (!meetingId) continue;

    const assignmentUser = evento.asignaciones[0]?.asistente.usuario ?? null;
    const assistantName =
      assignmentUser?.name ||
      [assignmentUser?.firstName, assignmentUser?.lastName].filter(Boolean).join(" ").trim() ||
      null;
    const assistantEmail = assignmentUser?.email ?? null;
    const assistantStatus = resolveAssistantStatus({
      requiresAssistance: evento.requiereAsistencia,
      assistantName,
      assistantEmail
    });

    const existing = associations.get(meetingId);
    if (existing?.linked) {
      associations.set(meetingId, {
        ...existing,
        eventoId: existing.eventoId ?? evento.id,
        requiresAssistance: evento.requiereAsistencia,
        assistantName,
        assistantEmail,
        assistantStatus
      });
      continue;
    }

    associations.set(meetingId, {
      linked: true,
      source: "EVENTO_ZOOM",
      solicitudId: evento.solicitud.id,
      solicitudTitulo: evento.solicitud.titulo,
      solicitudProgramaNombre: evento.solicitud.programaNombre ?? null,
      solicitudEstado: evento.solicitud.estadoSolicitud,
      eventoId: evento.id,
      requiresAssistance: evento.requiereAsistencia,
      assistantName,
      assistantEmail,
      assistantStatus
    });
  }

  return associations;
}
