import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { env } from "@/src/lib/env";

export const runtime = "nodejs";

type ZoomGroupMember = {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  type?: number;
  status?: string;
};

type ZoomMembersResponse = {
  members?: ZoomGroupMember[];
  next_page_token?: string;
};

type ZoomGroupResponse = {
  name?: string;
};

type ZoomMeeting = {
  id: number | string;
  topic?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  join_url?: string;
  status?: string;
};

type ZoomMeetingsResponse = {
  meetings?: ZoomMeeting[];
  total_records?: number;
};

function getBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

async function getZoomAccessToken(): Promise<string> {
  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    throw new Error("Faltan credenciales de Zoom en variables de entorno.");
  }

  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", env.ZOOM_ACCOUNT_ID);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${getBase64(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`)}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("No se pudo obtener el token de Zoom.");
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Zoom no devolvió access_token.");
  }

  return data.access_token;
}

async function listGroupMembers(groupId: string, accessToken: string): Promise<ZoomGroupMember[]> {
  const members: ZoomGroupMember[] = [];
  let nextPageToken = "";

  do {
    const url = new URL(`${env.ZOOM_API_BASE}/groups/${groupId}/members`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) {
      url.searchParams.set("next_page_token", nextPageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("No se pudieron listar las cuentas del grupo de Zoom.");
    }

    const data = (await response.json()) as ZoomMembersResponse;
    if (Array.isArray(data.members)) {
      members.push(...data.members);
    }

    nextPageToken = data.next_page_token ?? "";
  } while (nextPageToken);

  return members;
}

async function getGroupName(groupId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${env.ZOOM_API_BASE}/groups/${groupId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return "";
  }

  const data = (await response.json()) as ZoomGroupResponse;
  return data.name ?? "";
}

async function getPendingMeetingsForUser(
  userId: string,
  accessToken: string
): Promise<{ count: number; events: ZoomMeeting[] }> {
  const url = new URL(`${env.ZOOM_API_BASE}/users/${encodeURIComponent(userId)}/meetings`);
  url.searchParams.set("type", "upcoming");
  url.searchParams.set("page_size", "30");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    return { count: 0, events: [] };
  }

  const data = (await response.json()) as ZoomMeetingsResponse;
  return {
    count: data.total_records ?? data.meetings?.length ?? 0,
    events: data.meetings ?? []
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!env.ZOOM_GROUP_ID) {
    return NextResponse.json(
      { error: "ZOOM_GROUP_ID no está configurado." },
      { status: 400 }
    );
  }

  try {
    const token = await getZoomAccessToken();
    const groupName = await getGroupName(env.ZOOM_GROUP_ID, token);
    const members = await listGroupMembers(env.ZOOM_GROUP_ID, token);

    const accounts = await Promise.all(
      members.map(async (member) => {
        const pending = await getPendingMeetingsForUser(member.id, token);

        return {
          id: member.id,
          email: member.email ?? "",
          firstName: member.first_name ?? "",
          lastName: member.last_name ?? "",
          type: member.type ?? null,
          status: member.status ?? "",
          pendingEventsCount: pending.count,
          pendingEvents: pending.events.map((event) => ({
            id: String(event.id ?? ""),
            topic: event.topic ?? "Sin título",
            startTime: event.start_time ?? "",
            durationMinutes: event.duration ?? 0,
            timezone: event.timezone ?? "",
            joinUrl: event.join_url ?? "",
            status: event.status ?? ""
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
