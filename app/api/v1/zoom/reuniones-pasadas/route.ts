import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import {
  buildUnlinkedZoomMeetingAssociation,
  resolveZoomMeetingAssociations
} from "@/src/lib/zoom-association";
import { env } from "@/src/lib/env";
import {
  detectZoomUpcomingOverlaps,
  normalizeZoomUpcomingEvents
} from "@/src/lib/zoom-upcoming";
import { ZoomMeetingsClient } from "@/src/lib/zoom-meetings.client";

export const runtime = "nodejs";
const DEFAULT_MONTHS_BACK = 1;
const MAX_MONTHS_BACK = 12;

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseMonthsBack(raw: string | null): number {
  if (!raw) return DEFAULT_MONTHS_BACK;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MONTHS_BACK;
  const rounded = Math.floor(parsed);
  if (rounded < 1) return DEFAULT_MONTHS_BACK;
  return Math.min(rounded, MAX_MONTHS_BACK);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!env.ZOOM_GROUP_ID) {
    return NextResponse.json(
      { error: "ZOOM_GROUP_ID no esta configurado." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const monthsBack = parseMonthsBack(searchParams.get("monthsBack"));
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setUTCMonth(fromDate.getUTCMonth() - monthsBack);
  const from = toDateOnly(fromDate);
  const to = toDateOnly(toDate);

  try {
    const zoom = await ZoomMeetingsClient.fromAccountCredentials();
    const group = await zoom.getGroup(env.ZOOM_GROUP_ID);
    const groupName = getString(group?.name);
    const members = await zoom.listGroupMembers(env.ZOOM_GROUP_ID);

    const perAccount = await Promise.all(
      members.map(async (member) => {
        const memberId = getString(member.id);
        const accountEmail = getString(member.email);
        const accountName = [getString(member.first_name), getString(member.last_name)]
          .filter(Boolean)
          .join(" ")
          .trim();

        const previousMeetings = memberId
          ? await zoom
              .listUserMeetings(memberId, {
                type: "previous_meetings",
                page_size: 300,
                from,
                to
              })
              .catch(() => ({} as Record<string, unknown>))
          : ({} as Record<string, unknown>);

        const meetings = Array.isArray(previousMeetings.meetings)
          ? (previousMeetings.meetings as Array<Record<string, unknown>>)
          : [];
        const events = normalizeZoomUpcomingEvents(meetings);
        const overlapInfo = detectZoomUpcomingOverlaps(events);
        const conflictIds = new Set(overlapInfo.overlappingEventIds);

        return events.map((event) => ({
          ...event,
          accountId: memberId,
          accountEmail,
          accountName,
          hasAccountOverlap: conflictIds.has(event.id),
          accountOverlapCount: overlapInfo.overlapCount
        }));
      })
    );

    const rawEvents = perAccount
      .flat()
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    const associationByMeetingId = await resolveZoomMeetingAssociations(
      rawEvents.map((event) => event.meetingId)
    );

    const events = rawEvents.map((event) => ({
      ...event,
      association: event.meetingId
        ? associationByMeetingId.get(event.meetingId) ?? buildUnlinkedZoomMeetingAssociation()
        : buildUnlinkedZoomMeetingAssociation()
    }));

    return NextResponse.json({
      groupName,
      total: events.length,
      events,
      monthsBack,
      canLoadMoreBack: monthsBack < MAX_MONTHS_BACK,
      windowStart: from,
      windowEnd: to,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron listar reuniones pasadas de Zoom." },
      { status: 500 }
    );
  }
}
