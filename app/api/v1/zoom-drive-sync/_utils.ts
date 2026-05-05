import { UserRole } from "@prisma/client";
import { getSessionUser } from "@/src/lib/api-auth";
import { env } from "@/src/lib/env";

export type ZoomDriveSyncProxyConnection = {
  apiBaseUrl: string;
  apiKey?: string;
};

export type ZoomDriveSyncProxyConfigInput = {
  zoomGroupId?: string;
  driveDestinationId?: string;
};

type ProxyRequestBody = {
  connection?: Partial<ZoomDriveSyncProxyConnection>;
  config?: ZoomDriveSyncProxyConfigInput;
};

export async function requireAdminForZoomDriveSync() {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false as const, status: 401, body: { error: "Unauthorized" } };
  }
  if (user.role !== UserRole.ADMINISTRADOR) {
    return { ok: false as const, status: 403, body: { error: "Forbidden" } };
  }
  return { ok: true as const };
}

export async function parseProxyRequestBody(request: Request): Promise<{
  connection: ZoomDriveSyncProxyConnection;
  config: ZoomDriveSyncProxyConfigInput;
}> {
  let body: ProxyRequestBody = {};
  try {
    body = (await request.json()) as ProxyRequestBody;
  } catch {
    body = {};
  }

  const apiBaseUrl = (
    body.connection?.apiBaseUrl?.trim() ||
    env.ZOOM_DRIVE_SYNC_API_BASE_URL?.trim() ||
    ""
  );
  if (!apiBaseUrl) {
    throw new Error("Debes indicar la URL del backend de sincronizacion.");
  }
  const apiKey = body.connection?.apiKey?.trim() || env.ZOOM_DRIVE_SYNC_API_KEY?.trim() || "";
  return {
    connection: {
      apiBaseUrl,
      apiKey: apiKey || undefined
    },
    config: body.config ?? {}
  };
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildBackendSyncConfig(input: ZoomDriveSyncProxyConfigInput): Record<string, unknown> {
  const zoomClientId = cleanString(env.ZOOM_CLIENT_ID);
  const zoomClientSecret = cleanString(env.ZOOM_CLIENT_SECRET);
  const zoomAccountId = cleanString(env.ZOOM_ACCOUNT_ID);

  if (!zoomClientId || !zoomClientSecret || !zoomAccountId) {
    throw new Error(
      "Faltan credenciales Zoom en variables del servidor web (ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_ACCOUNT_ID)."
    );
  }

  const config: Record<string, unknown> = {
    ZOOM_CLIENT_ID: zoomClientId,
    ZOOM_CLIENT_SECRET: zoomClientSecret,
    ZOOM_ACCOUNT_ID: zoomAccountId,
    ZOOM_API_BASE: cleanString(env.ZOOM_API_BASE) || "https://api.zoom.us/v2",
    ZOOM_GROUP_ID: cleanString(input.zoomGroupId) || cleanString(env.ZOOM_GROUP_ID),
    TIMEZONE: cleanString(env.TIMEZONE) || "America/Montevideo",
    DRIVE_DESTINATION_ID: cleanString(input.driveDestinationId) || cleanString(env.DRIVE_DESTINATION_ID),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: cleanString(env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
    GOOGLE_PRIVATE_KEY: cleanString(env.GOOGLE_PRIVATE_KEY),
    GOOGLE_SERVICE_ACCOUNT_SUBJECT: cleanString(env.GOOGLE_SERVICE_ACCOUNT_SUBJECT)
  };

  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string" && value.trim() === "") continue;
    compact[key] = value;
  }
  return compact;
}

export async function proxyToSyncBackend<T>(
  path: string,
  connection: ZoomDriveSyncProxyConnection,
  config: Record<string, unknown>
): Promise<{
  ok: boolean;
  status: number;
  json: T | { error: string };
}> {
  const base = connection.apiBaseUrl.replace(/\/+$/, "");
  const target = `${base}${path}`;
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(connection.apiKey ? { "X-API-Key": connection.apiKey } : {})
      },
      body: JSON.stringify({ config }),
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        json: {
          error:
            (typeof payload.detail === "string" && payload.detail) ||
            (typeof payload.error === "string" && payload.error) ||
            "No se pudo completar la solicitud al backend de sincronizacion."
        }
      };
    }
    return {
      ok: true,
      status: response.status,
      json: payload as T
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      json: {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo conectar con el backend de sincronizacion."
      }
    };
  }
}
