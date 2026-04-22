import { NextResponse } from "next/server";
import { env } from "@/src/lib/env";
import { requireAdminForZoomDriveSync } from "../_utils";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireAdminForZoomDriveSync();
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  return NextResponse.json({
    defaults: {
      apiBaseUrl: env.ZOOM_DRIVE_SYNC_API_BASE_URL ?? "",
      timezone: env.TIMEZONE,
      zoomGroupId: env.ZOOM_GROUP_ID ?? "",
      driveDestinationId: env.DRIVE_DESTINATION_ID ?? "",
      telegramChatId: "",
    },
    zoomConfig: {
      usesServerVariables: true,
      zoomApiBase: env.ZOOM_API_BASE,
      hasZoomClientId: Boolean(env.ZOOM_CLIENT_ID),
      hasZoomClientSecret: Boolean(env.ZOOM_CLIENT_SECRET),
      hasZoomAccountId: Boolean(env.ZOOM_ACCOUNT_ID),
      hasGoogleServiceAccountEmail: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      hasGooglePrivateKey: Boolean(env.GOOGLE_PRIVATE_KEY),
    }
  });
}
