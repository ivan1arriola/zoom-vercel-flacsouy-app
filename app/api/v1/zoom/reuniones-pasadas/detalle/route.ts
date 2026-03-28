import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { ZoomMeetingsClient } from "@/src/lib/zoom-meetings.client";

export const runtime = "nodejs";

type ZoomJson = Record<string, unknown>;

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseIsoDateOrNull(value: unknown): Date | null {
  const raw = getString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveParticipantIdentity(participant: Record<string, unknown>, fallbackIndex: number): string {
  const email = getString(participant.user_email || participant.email).trim().toLowerCase();
  if (email) return `email:${email}`;

  const participantId = getString(participant.id).trim();
  if (participantId) return `id:${participantId}`;

  const userId = getString(participant.user_id).trim();
  if (userId) return `user:${userId}`;

  const registrantId = getString(participant.registrant_id).trim();
  if (registrantId) return `registrant:${registrantId}`;

  const name = getString(participant.name).trim().toLowerCase();
  if (name) return `name:${name}`;

  return `row:${fallbackIndex}`;
}

async function getFirstPastMeetingPayload(
  zoom: ZoomMeetingsClient,
  identifiers: string[]
): Promise<ZoomJson | null> {
  for (const identifier of identifiers) {
    const payload = await zoom.getPastMeeting(identifier).catch(() => null);
    if (payload) return payload;
  }
  return null;
}

async function getParticipantsData(
  zoom: ZoomMeetingsClient,
  identifiers: string[]
): Promise<{
  available: boolean;
  participants: Array<Record<string, unknown>>;
  totalRecords: number | null;
}> {
  for (const identifier of identifiers) {
    const participants: Array<Record<string, unknown>> = [];
    let totalRecords: number | null = null;
    let nextPageToken = "";
    let page = 0;
    let foundAnyPage = false;

    do {
      const payload = await zoom
        .getPastMeetingParticipants(identifier, {
          page_size: 300,
          next_page_token: nextPageToken || undefined
        })
        .catch(() => null);

      if (!payload) {
        if (page === 0) {
          foundAnyPage = false;
        }
        break;
      }

      foundAnyPage = true;
      page += 1;

      const pageParticipants = Array.isArray(payload.participants)
        ? (payload.participants as Array<Record<string, unknown>>)
        : [];
      participants.push(...pageParticipants);

      const maybeTotal = getNumber(payload.total_records);
      if (maybeTotal !== null) totalRecords = maybeTotal;

      const token = getString(payload.next_page_token);
      if (!token || token === nextPageToken || page >= 20) {
        break;
      }
      nextPageToken = token;
    } while (nextPageToken);

    if (foundAnyPage) {
      return {
        available: true,
        participants,
        totalRecords
      };
    }
  }

  return {
    available: false,
    participants: [],
    totalRecords: null
  };
}

async function getQaQuestionsCount(
  zoom: ZoomMeetingsClient,
  identifiers: string[]
): Promise<number | null> {
  for (const identifier of identifiers) {
    const payload = await zoom.listPastMeetingQa(identifier).catch(() => null);
    if (!payload) continue;

    const totalRecords = getNumber(payload.total_records);
    if (totalRecords !== null) return totalRecords;

    if (Array.isArray(payload.questions)) {
      return payload.questions.length;
    }

    return 0;
  }

  return null;
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meetingId")?.trim() ?? "";
  const meetingUuid = searchParams.get("meetingUuid")?.trim() || null;

  if (!meetingId) {
    return NextResponse.json({ error: "meetingId es obligatorio." }, { status: 400 });
  }

  const meetingIdentifiers = Array.from(
    new Set([meetingUuid, meetingId].filter((value): value is string => Boolean(value && value.trim())))
  );

  try {
    const zoom = await ZoomMeetingsClient.fromAccountCredentials();

    const [pastMeetingPayload, participantsData, qaQuestionsCount, instancesPayload] = await Promise.all([
      getFirstPastMeetingPayload(zoom, meetingIdentifiers),
      getParticipantsData(zoom, meetingIdentifiers),
      getQaQuestionsCount(zoom, meetingIdentifiers),
      zoom.listPastMeetingInstances(meetingId).catch(() => null)
    ]);

    const startDate = parseIsoDateOrNull(pastMeetingPayload?.start_time);
    const endDate = parseIsoDateOrNull(pastMeetingPayload?.end_time);
    const durationFromApi = getNumber(pastMeetingPayload?.duration);
    const durationFromTimes =
      startDate && endDate
        ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60_000))
        : null;
    const durationMinutes =
      durationFromApi !== null
        ? Math.max(0, Math.round(durationFromApi))
        : durationFromTimes;

    const uniqueParticipants = new Set<string>();
    participantsData.participants.forEach((participant, index) => {
      uniqueParticipants.add(resolveParticipantIdentity(participant, index));
    });

    const participantsCount = participantsData.available
      ? participantsData.totalRecords ?? participantsData.participants.length
      : null;
    const uniqueParticipantsCount = participantsData.available ? uniqueParticipants.size : null;

    const rawInstances = Array.isArray(instancesPayload?.meetings)
      ? (instancesPayload.meetings as Array<Record<string, unknown>>)
      : [];
    const pastInstancesCount = pastMeetingPayload
      ? Math.max(rawInstances.length, 1)
      : instancesPayload
        ? rawInstances.length
        : null;

    return NextResponse.json({
      details: {
        meetingId,
        meetingUuid,
        participantsCount,
        uniqueParticipantsCount,
        qaQuestionsCount,
        pastInstancesCount,
        durationMinutes,
        status: getString(pastMeetingPayload?.status) || null,
        startTime: startDate ? startDate.toISOString() : null,
        endTime: endDate ? endDate.toISOString() : null
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los detalles de la reunion pasada."
      },
      { status: 500 }
    );
  }
}
