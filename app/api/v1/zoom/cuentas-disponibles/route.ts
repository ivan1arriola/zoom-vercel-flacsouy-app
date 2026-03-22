import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { env } from "@/src/lib/env";
import { ZoomMeetingsClient } from "@/src/lib/zoom-meetings.client";

export const runtime = "nodejs";

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET() {
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

  try {
    const zoom = await ZoomMeetingsClient.fromAccountCredentials();
    const group = await zoom.getGroup(env.ZOOM_GROUP_ID);
    const groupName = getString(group?.name);
    const members = await zoom.listGroupMembers(env.ZOOM_GROUP_ID);

    const accounts = await Promise.all(
      members.map(async (member) => {
        const memberId = getString(member.id);
        const upcoming = memberId
          ? await zoom
              .listUserMeetings(memberId, { type: "upcoming", page_size: 30 })
              .catch(() => ({} as Record<string, unknown>))
          : ({} as Record<string, unknown>);

        const meetings = Array.isArray(upcoming.meetings)
          ? (upcoming.meetings as Array<Record<string, unknown>>)
          : [];
        const totalRecordsRaw = upcoming.total_records;
        const pendingCount =
          (typeof totalRecordsRaw === "number" && Number.isFinite(totalRecordsRaw)
            ? totalRecordsRaw
            : meetings.length) ?? 0;

        return {
          id: memberId,
          email: getString(member.email),
          firstName: getString(member.first_name),
          lastName: getString(member.last_name),
          type: getNumber(member.type),
          status: getString(member.status),
          pendingEventsCount: pendingCount,
          pendingEvents: meetings.map((event) => ({
            id: String(event.id ?? ""),
            topic: getString(event.topic) || "Sin titulo",
            startTime: getString(event.start_time),
            durationMinutes: getNumber(event.duration) ?? 0,
            timezone: getString(event.timezone),
            joinUrl: getString(event.join_url),
            status: getString(event.status)
          }))
        };
      })
    );

    return NextResponse.json({
      groupName,
      total: accounts.length,
      accounts
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron listar cuentas de Zoom." },
      { status: 500 }
    );
  }
}
