import { NextResponse } from "next/server";
import {
  buildBackendSyncConfig,
  parseProxyRequestBody,
  proxyToSyncBackend,
  requireAdminForZoomDriveSync
} from "../_utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await requireAdminForZoomDriveSync();
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  try {
    const { connection, config: inputConfig } = await parseProxyRequestBody(request);
    const backendConfig = buildBackendSyncConfig(inputConfig);
    const result = await proxyToSyncBackend(
      "/api/v1/zoom-drive-sync/validate",
      connection,
      backendConfig
    );
    return NextResponse.json(result.json, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo validar la configuracion."
      },
      { status: 400 }
    );
  }
}
