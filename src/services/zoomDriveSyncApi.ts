export type ZoomDriveSyncConnection = {
  apiBaseUrl: string;
  apiKey?: string;
};

export type ZoomDriveSyncConfigInput = {
  zoomGroupId?: string;
  driveDestinationId?: string;
};

export type ZoomGroup = {
  id: string;
  name: string;
  totalMembers: number;
};

export type ZoomGroupsResponse = {
  groups: ZoomGroup[];
  selectedGroupId: string;
};

export type ZoomDriveSyncBootstrapResponse = {
  defaults: {
    apiBaseUrl: string;
    timezone: string;
    zoomGroupId: string;
    driveDestinationId: string;
  };
  zoomConfig: {
    usesServerVariables: boolean;
    zoomApiBase: string;
    hasZoomClientId: boolean;
    hasZoomClientSecret: boolean;
    hasZoomAccountId: boolean;
    hasGoogleServiceAccountEmail: boolean;
    hasGooglePrivateKey: boolean;
  };
};

export type ZoomDriveSyncValidationResponse = {
  ok: boolean;
  message?: string;
  settingsPreview?: {
    scope?: string;
    timezone?: string;
    driveDestinationId?: string;
    parallelWorkers?: number;
    mediaWorkers?: number;
    deleteFromZoom?: boolean;
  };
};

export type ZoomDriveSyncRunResponse = {
  ok: boolean;
  message?: string;
  elapsedSeconds?: number;
  settingsPreview?: ZoomDriveSyncValidationResponse["settingsPreview"];
  result?: {
    meetingsSeen: number;
    filesDownloaded: number;
    filesUploaded: number;
    filesSkipped: number;
    zoomDeleted: number;
  };
  eventsTail?: Array<{
    event: string;
    timestamp: string;
    topic?: string | null;
    fileName?: string | null;
    error?: string | null;
    meetingsSeen?: number;
    filesDownloaded?: number;
    filesUploaded?: number;
    filesSkipped?: number;
    zoomDeleted?: number;
  }>;
};

export type ZoomDriveSyncProgressEvent = NonNullable<ZoomDriveSyncRunResponse["eventsTail"]>[number];

export type StoredDriveRecording = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  createdTime: string;
  modifiedTime: string;
  size: number | null;
};

export type StoredDriveRecordingsResponse = {
  ok: boolean;
  driveDestinationId: string;
  items: StoredDriveRecording[];
  nextPageToken?: string;
};

export type ZoomDriveSyncApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function readError(response: Response): Promise<string> {
  const payload = await readJson<{ error?: string; detail?: string; message?: string }>(response);
  return payload?.error || payload?.detail || payload?.message || "No se pudo completar la solicitud.";
}

export async function loadZoomDriveSyncBootstrap(): Promise<ZoomDriveSyncApiResponse<ZoomDriveSyncBootstrapResponse>> {
  try {
    const response = await fetch("/api/v1/zoom-drive-sync/bootstrap", { cache: "no-store" });
    if (!response.ok) {
      return {
        success: false,
        error: await readError(response)
      };
    }
    return {
      success: true,
      data: (await response.json()) as ZoomDriveSyncBootstrapResponse
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo cargar la configuracion inicial."
    };
  }
}

export async function loadZoomGroups(): Promise<ZoomDriveSyncApiResponse<ZoomGroupsResponse>> {
  try {
    const response = await fetch("/api/v1/zoom/grupos", { cache: "no-store" });
    if (!response.ok) {
      return {
        success: false,
        error: await readError(response)
      };
    }
    return {
      success: true,
      data: (await response.json()) as ZoomGroupsResponse
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudieron cargar los grupos Zoom."
    };
  }
}

export async function loadStoredDriveRecordings(params: {
  driveDestinationId?: string;
  pageToken?: string;
  pageSize?: number;
}): Promise<ZoomDriveSyncApiResponse<StoredDriveRecordingsResponse>> {
  try {
    const response = await fetch("/api/v1/zoom-drive-sync/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    if (!response.ok) {
      return {
        success: false,
        error: await readError(response)
      };
    }
    return {
      success: true,
      data: (await response.json()) as StoredDriveRecordingsResponse
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudieron cargar las grabaciones guardadas."
    };
  }
}

type ProxyPayload = {
  connection: ZoomDriveSyncConnection;
  config: ZoomDriveSyncConfigInput;
};

async function postToProxyRoute<T>(
  path: string,
  payload: ProxyPayload
): Promise<ZoomDriveSyncApiResponse<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return {
        success: false,
        error: await readError(response)
      };
    }
    return {
      success: true,
      data: (await response.json()) as T
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo conectar con el servidor."
    };
  }
}

export async function validateZoomDriveSyncConfig(
  connection: ZoomDriveSyncConnection,
  config: ZoomDriveSyncConfigInput
): Promise<ZoomDriveSyncApiResponse<ZoomDriveSyncValidationResponse>> {
  return postToProxyRoute<ZoomDriveSyncValidationResponse>(
    "/api/v1/zoom-drive-sync/validate",
    { connection, config }
  );
}

export async function runZoomDriveSync(
  connection: ZoomDriveSyncConnection,
  config: ZoomDriveSyncConfigInput
): Promise<ZoomDriveSyncApiResponse<ZoomDriveSyncRunResponse>> {
  return postToProxyRoute<ZoomDriveSyncRunResponse>(
    "/api/v1/zoom-drive-sync/sync",
    { connection, config }
  );
}

type SyncStreamLine =
  | {
      type: "started";
      message?: string;
    }
  | {
      type: "progress";
      event?: ZoomDriveSyncProgressEvent;
    }
  | ({
      type: "completed";
    } & ZoomDriveSyncRunResponse)
  | {
      type: "error";
      message?: string;
      error?: string;
    };

type ZoomDriveSyncStreamHandlers = {
  onStarted?: (message: string) => void;
  onProgress?: (event: ZoomDriveSyncProgressEvent) => void;
};

function readNdjsonLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

export async function runZoomDriveSyncWithProgress(
  connection: ZoomDriveSyncConnection,
  config: ZoomDriveSyncConfigInput,
  handlers: ZoomDriveSyncStreamHandlers = {}
): Promise<ZoomDriveSyncApiResponse<ZoomDriveSyncRunResponse>> {
  try {
    const response = await fetch("/api/v1/zoom-drive-sync/sync/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection, config })
    });

    if (!response.ok) {
      return {
        success: false,
        error: await readError(response)
      };
    }

    if (!response.body) {
      return {
        success: false,
        error: "El servidor no devolvio stream de progreso."
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completedPayload: ZoomDriveSyncRunResponse | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const { lines, rest } = readNdjsonLines(buffer);
      buffer = rest;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        let payload: SyncStreamLine | null = null;
        try {
          payload = JSON.parse(line) as SyncStreamLine;
        } catch {
          payload = null;
        }
        if (!payload || typeof payload !== "object") continue;

        if (payload.type === "started") {
          handlers.onStarted?.(payload.message || "Sincronizacion iniciada.");
          continue;
        }

        if (payload.type === "progress") {
          if (payload.event) handlers.onProgress?.(payload.event);
          continue;
        }

        if (payload.type === "error") {
          return {
            success: false,
            error: payload.message || payload.error || "Error durante la sincronizacion."
          };
        }

        if (payload.type === "completed") {
          completedPayload = payload;
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const tailLines = buffer.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      for (const line of tailLines) {
        let payload: SyncStreamLine | null = null;
        try {
          payload = JSON.parse(line) as SyncStreamLine;
        } catch {
          payload = null;
        }
        if (!payload || typeof payload !== "object") continue;
        if (payload.type === "error") {
          return {
            success: false,
            error: payload.message || payload.error || "Error durante la sincronizacion."
          };
        }
        if (payload.type === "completed") {
          completedPayload = payload;
        }
      }
    }

    if (!completedPayload) {
      return {
        success: false,
        error: "La sincronizacion termino sin respuesta final."
      };
    }

    return {
      success: true,
      data: completedPayload
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo conectar con el servidor."
    };
  }
}
