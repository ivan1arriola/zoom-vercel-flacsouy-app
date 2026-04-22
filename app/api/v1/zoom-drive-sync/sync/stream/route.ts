import { NextResponse } from "next/server";
import {
  buildBackendSyncConfig,
  parseProxyRequestBody,
  requireAdminForZoomDriveSync
} from "../../_utils";

export const runtime = "nodejs";

function readBackendError(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail.trim();
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim();
  return "";
}

export async function POST(request: Request) {
  const access = await requireAdminForZoomDriveSync();
  if (!access.ok) {
    return NextResponse.json(access.body, { status: access.status });
  }

  try {
    const { connection, config: inputConfig } = await parseProxyRequestBody(request);
    const backendConfig = buildBackendSyncConfig(inputConfig);
    const target = `${connection.apiBaseUrl.replace(/\/+$/, "")}/api/v1/zoom-drive-sync/sync/stream`;
    const backendResponse = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.apiKey ? { "X-API-Key": connection.apiKey } : {})
      },
      body: JSON.stringify({ config: backendConfig }),
      cache: "no-store"
    });

    if (!backendResponse.ok) {
      const payload = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            readBackendError(payload) ||
            "No se pudo iniciar la sincronizacion en el backend."
        },
        { status: backendResponse.status }
      );
    }

    if (!backendResponse.body) {
      return NextResponse.json(
        { error: "El backend no devolvio stream de progreso." },
        { status: 502 }
      );
    }

    return new Response(backendResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo conectar con el backend de sincronizacion."
      },
      { status: 502 }
    );
  }
}
