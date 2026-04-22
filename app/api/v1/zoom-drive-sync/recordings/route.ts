import { NextResponse } from "next/server";
import { listStoredRecordings } from "@/src/lib/google-drive.client";
import { requireAdminForZoomDriveSync } from "../_utils";

export const runtime = "nodejs";

type RequestBody = {
  driveDestinationId?: string;
  pageToken?: string;
  pageSize?: number;
};

function parseBody(raw: unknown): RequestBody {
  if (!raw || typeof raw !== "object") return {};
  const body = raw as Record<string, unknown>;
  return {
    driveDestinationId:
      typeof body.driveDestinationId === "string" ? body.driveDestinationId.trim() : undefined,
    pageToken: typeof body.pageToken === "string" ? body.pageToken.trim() : undefined,
    pageSize: typeof body.pageSize === "number" ? body.pageSize : undefined
  };
}

export async function POST(request: Request) {
  const access = await requireAdminForZoomDriveSync();
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = parseBody(rawBody);
    const result = await listStoredRecordings({
      driveDestinationId: body.driveDestinationId,
      pageToken: body.pageToken,
      pageSize: body.pageSize
    });
    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las grabaciones guardadas."
      },
      { status: 400 }
    );
  }
}
