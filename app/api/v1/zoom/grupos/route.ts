import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { env } from "@/src/lib/env";
import { ZoomMeetingsClient } from "@/src/lib/zoom-meetings.client";

export const runtime = "nodejs";

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const zoom = await ZoomMeetingsClient.fromAccountCredentials();
    const groupsRaw = await zoom.listGroups();
    const groups = groupsRaw
      .map((group) => ({
        id: toStringValue(group.id),
        name: toStringValue(group.name),
        totalMembers: toNumberValue(group.total_members ?? group.member_count ?? group.members_count)
      }))
      .filter((group) => group.id && group.name)
      .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

    return NextResponse.json({
      groups,
      selectedGroupId: env.ZOOM_GROUP_ID ?? ""
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron obtener los grupos de Zoom."
      },
      { status: 500 }
    );
  }
}
