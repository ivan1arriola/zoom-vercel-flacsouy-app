import {
  EstadoAsignacion,
  EstadoEventoZoom,
  TipoAsignacionAsistente,
  UserRole
} from "@prisma/client";
import { google, type calendar_v3 } from "googleapis";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";
import { env } from "@/src/lib/env";

export const runtime = "nodejs";

const GOOGLE_CALENDAR_WRITE_SCOPES = new Set<string>([
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.events.owned"
]);

type UpcomingMeeting = {
  assignmentId: string | null;
  eventId: string;
  solicitudId: string;
  titulo: string;
  programaNombre: string | null;
  responsableNombre: string | null;
  inicioProgramadoAt: string;
  finProgramadoAt: string;
  modalidadReunion: string;
  zoomMeetingId: string | null;
  zoomJoinUrl: string | null;
};

function hasCalendarWriteScope(scopeRaw?: string | null): boolean {
  const scopes = (scopeRaw ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return scopes.some((scope) => GOOGLE_CALENDAR_WRITE_SCOPES.has(scope));
}

function normalizeZoomMeetingId(value?: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

function resolveJoinUrl(meeting: UpcomingMeeting): string | null {
  const explicitJoinUrl = (meeting.zoomJoinUrl ?? "").trim();
  if (explicitJoinUrl) return explicitJoinUrl;
  const meetingId = normalizeZoomMeetingId(meeting.zoomMeetingId);
  return meetingId ? `https://zoom.us/j/${meetingId}` : null;
}

function buildEventDescription(meeting: UpcomingMeeting): string {
  const meetingId = normalizeZoomMeetingId(meeting.zoomMeetingId);
  const joinUrl = resolveJoinUrl(meeting);
  const lines = [
    `Programa: ${meeting.programaNombre ?? "Sin programa"}`,
    `Responsable: ${meeting.responsableNombre ?? "Sin responsable"}`,
    `Modalidad: ${meeting.modalidadReunion}`,
    `Solicitud: ${meeting.solicitudId}`,
    meetingId ? `Meeting ID: ${meetingId}` : null,
    joinUrl ? `Zoom: ${joinUrl}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

function buildCalendarEventBody(meeting: UpcomingMeeting, baseUrl: string): calendar_v3.Schema$Event {
  const joinUrl = resolveJoinUrl(meeting);
  const summary = (meeting.titulo ?? "").trim() || "Reunion Zoom";

  return {
    summary,
    location: "Zoom",
    description: buildEventDescription(meeting),
    start: {
      dateTime: meeting.inicioProgramadoAt
    },
    end: {
      dateTime: meeting.finProgramadoAt
    },
    source: {
      title: "FLACSO Zoom Uruguay",
      url: baseUrl
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 }
      ]
    },
    extendedProperties: {
      private: {
        flacsoApp: "flacso-zoom-web",
        flacsoEventId: meeting.eventId,
        flacsoSolicitudId: meeting.solicitudId,
        flacsoAssignmentId: meeting.assignmentId ?? ""
      }
    },
    visibility: "default",
    status: "confirmed"
  };
}

async function listUpcomingMeetingsForUser(userId: string, role: UserRole): Promise<UpcomingMeeting[]> {
  const now = new Date();

  if (role === UserRole.DOCENTE) {
    const events = await db.eventoZoom.findMany({
      where: {
        solicitud: { docente: { usuarioId: userId } },
        estadoEvento: { not: EstadoEventoZoom.CANCELADO },
        finProgramadoAt: { gte: now }
      },
      select: {
        id: true,
        solicitudSalaId: true,
        modalidadReunion: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        zoomMeetingId: true,
        zoomJoinUrl: true,
        solicitud: {
          select: {
            titulo: true,
            programaNombre: true,
            responsableNombre: true
          }
        }
      },
      orderBy: [{ inicioProgramadoAt: "asc" }]
    });

    return events.map((event) => ({
      assignmentId: null,
      eventId: event.id,
      solicitudId: event.solicitudSalaId,
      titulo: event.solicitud.titulo,
      programaNombre: event.solicitud.programaNombre ?? null,
      responsableNombre: event.solicitud.responsableNombre ?? null,
      inicioProgramadoAt: event.inicioProgramadoAt.toISOString(),
      finProgramadoAt: event.finProgramadoAt.toISOString(),
      modalidadReunion: event.modalidadReunion,
      zoomMeetingId: event.zoomMeetingId,
      zoomJoinUrl: event.zoomJoinUrl
    }));
  }

  const assignments = await db.asignacionAsistente.findMany({
    where: {
      tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
      estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] },
      asistente: { usuarioId: userId },
      evento: {
        estadoEvento: { not: EstadoEventoZoom.CANCELADO },
        finProgramadoAt: { gte: now }
      }
    },
    select: {
      id: true,
      evento: {
        select: {
          id: true,
          solicitudSalaId: true,
          modalidadReunion: true,
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          zoomMeetingId: true,
          zoomJoinUrl: true,
          solicitud: {
            select: {
              titulo: true,
              programaNombre: true,
              responsableNombre: true
            }
          }
        }
      }
    },
    orderBy: {
      evento: {
        inicioProgramadoAt: "asc"
      }
    }
  });

  return assignments.map((assignment) => ({
    assignmentId: assignment.id,
    eventId: assignment.evento.id,
    solicitudId: assignment.evento.solicitudSalaId,
    titulo: assignment.evento.solicitud.titulo,
    programaNombre: assignment.evento.solicitud.programaNombre ?? null,
    responsableNombre: assignment.evento.solicitud.responsableNombre ?? null,
    inicioProgramadoAt: assignment.evento.inicioProgramadoAt.toISOString(),
    finProgramadoAt: assignment.evento.finProgramadoAt.toISOString(),
    modalidadReunion: assignment.evento.modalidadReunion,
    zoomMeetingId: assignment.evento.zoomMeetingId,
    zoomJoinUrl: assignment.evento.zoomJoinUrl
  }));
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canSync =
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.ASISTENTE_ZOOM ||
    user.role === UserRole.DOCENTE;
  if (!canSync) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
    return NextResponse.json(
      { error: "Google OAuth no esta configurado en el servidor." },
      { status: 500 }
    );
  }

  const account = await db.account.findFirst({
    where: {
      userId: user.id,
      provider: "google"
    },
    select: {
      provider: true,
      providerAccountId: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      token_type: true,
      scope: true
    }
  });

  if (!account) {
    return NextResponse.json(
      { error: "No tienes una cuenta de Google vinculada. Vincula Google desde tu perfil." },
      { status: 400 }
    );
  }

  if (!hasCalendarWriteScope(account.scope)) {
    return NextResponse.json(
      {
        error:
          "Tu vinculacion actual de Google no incluye permisos de calendario. Desvincula y vuelve a vincular Google para autorizar Calendar API."
      },
      { status: 400 }
    );
  }

  if (!account.access_token && !account.refresh_token) {
    return NextResponse.json(
      {
        error:
          "No hay token de Google disponible para sincronizar calendario. Desvincula y vuelve a vincular Google."
      },
      { status: 400 }
    );
  }

  const meetings = await listUpcomingMeetingsForUser(user.id, user.role);
  if (meetings.length === 0) {
    return NextResponse.json({
      ok: true,
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      message: "No hay próximas reuniones para sincronizar."
    });
  }

  const oauth2Client = new google.auth.OAuth2(env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET);
  oauth2Client.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
    token_type: account.token_type ?? undefined,
    scope: account.scope ?? undefined
  });

  try {
    await oauth2Client.getAccessToken();
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo autenticar con Google Calendar. Desvincula y vuelve a vincular Google para renovar permisos."
      },
      { status: 400 }
    );
  }

  const calendar = google.calendar({
    version: "v3",
    auth: oauth2Client
  });

  const baseUrl = env.APP_BASE_URL || new URL(request.url).origin;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const meeting of meetings) {
    const existing = await calendar.events.list({
      calendarId: "primary",
      maxResults: 1,
      singleEvents: true,
      showDeleted: false,
      privateExtendedProperty: [
        "flacsoApp=flacso-zoom-web",
        `flacsoEventId=${meeting.eventId}`
      ]
    });

    const existingEvent = existing.data.items?.[0];
    const body = buildCalendarEventBody(meeting, baseUrl);

    try {
      if (existingEvent?.id) {
        await calendar.events.patch({
          calendarId: "primary",
          eventId: existingEvent.id,
          requestBody: body
        });
        updated += 1;
      } else {
        await calendar.events.insert({
          calendarId: "primary",
          requestBody: body
        });
        created += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  const refreshedCredentials = oauth2Client.credentials;
  await db.account.update({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId
      }
    },
    data: {
      access_token:
        typeof refreshedCredentials.access_token === "string"
          ? refreshedCredentials.access_token
          : undefined,
      refresh_token:
        typeof refreshedCredentials.refresh_token === "string"
          ? refreshedCredentials.refresh_token
          : undefined,
      expires_at:
        typeof refreshedCredentials.expiry_date === "number"
          ? Math.floor(refreshedCredentials.expiry_date / 1000)
          : undefined,
      scope:
        typeof refreshedCredentials.scope === "string"
          ? refreshedCredentials.scope
          : undefined,
      token_type:
        typeof refreshedCredentials.token_type === "string"
          ? refreshedCredentials.token_type
          : undefined
    }
  }).catch(() => undefined);

  const total = meetings.length;
  const synced = created + updated;
  const message =
    skipped === 0
      ? `Sincronizacion completada. ${synced} reuniones en Google Calendar.`
      : `Sincronizacion parcial. ${synced} reuniones sincronizadas y ${skipped} omitidas.`;

  return NextResponse.json({
    ok: true,
    total,
    created,
    updated,
    skipped,
    message
  });
}
