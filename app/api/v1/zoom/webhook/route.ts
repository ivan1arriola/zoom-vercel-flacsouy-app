import * as crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  buildBackendSyncConfig,
  proxyToSyncBackend,
  type ZoomDriveSyncProxyConnection
} from "../../zoom-drive-sync/_utils";
import { asBoolean, env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";
import { createAdminZoomRecordingNotifications } from "@/src/modules/notificaciones/service";

export const runtime = "nodejs";

const SIGNATURE_VERSION = "v0";
const MAX_REQUEST_AGE_SECONDS = 5 * 60;
const RECORDING_EVENTS = new Set<string>([
  "recording.archive_files_completed",
  "recording.batch_deleted",
  "recording.batch_recovered",
  "recording.batch_trashed",
  "recording.cloud_storage_usage_updated",
  "recording.completed",
  "recording.deleted",
  "recording.paused",
  "recording.recovered",
  "recording.registration_approved",
  "recording.registration_created",
  "recording.registration_denied",
  "recording.renamed",
  "recording.resumed",
  "recording.started",
  "recording.stopped",
  "recording.transcript_completed",
  "recording.trashed"
]);

const AUTO_SYNC_EVENTS = new Set<string>([
  "recording.completed",
  "recording.transcript_completed"
]);

type ZoomWebhookPayload = {
  event?: unknown;
  event_ts?: unknown;
  payload?: {
    plainToken?: unknown;
    account_id?: unknown;
    object?: unknown;
  };
};

type ZoomDriveSyncRunResponse = {
  ok?: boolean;
  message?: string;
  elapsedSeconds?: number;
  result?: {
    meetingsSeen?: number;
    filesDownloaded?: number;
    filesUploaded?: number;
    filesSkipped?: number;
    zoomDeleted?: number;
    telegramMessagesSent?: number;
  };
};

function toTrimmedString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function parseWebhookPayload(rawBody: string): ZoomWebhookPayload | null {
  if (!rawBody.trim()) return null;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ZoomWebhookPayload;
  } catch {
    return null;
  }
}

function sha256Hex(secret: string, value: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function secureCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyZoomSignature(rawBody: string, request: Request, secretToken: string): {
  ok: boolean;
  error?: string;
} {
  const timestamp = toTrimmedString(request.headers.get("x-zm-request-timestamp"));
  const signature = toTrimmedString(request.headers.get("x-zm-signature"));

  if (!timestamp || !signature) {
    return {
      ok: false,
      error: "Faltan encabezados de firma Zoom (x-zm-request-timestamp / x-zm-signature)."
    };
  }

  const parsedTimestamp = Number(timestamp);
  if (Number.isFinite(parsedTimestamp)) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const delta = Math.abs(nowSeconds - parsedTimestamp);
    if (delta > MAX_REQUEST_AGE_SECONDS) {
      return {
        ok: false,
        error: "Timestamp de webhook fuera de ventana permitida."
      };
    }
  }

  const message = `${SIGNATURE_VERSION}:${timestamp}:${rawBody}`;
  const expectedSignature = `${SIGNATURE_VERSION}=${sha256Hex(secretToken, message)}`;

  if (!secureCompare(signature, expectedSignature)) {
    return {
      ok: false,
      error: "Firma de Zoom invalida."
    };
  }

  return { ok: true };
}

function extractRecordingContext(body: ZoomWebhookPayload): {
  meetingId?: string;
  meetingUuid?: string;
  topic?: string;
  accountId?: string;
} {
  const payloadObject = body.payload?.object;
  const object = payloadObject && typeof payloadObject === "object"
    ? (payloadObject as Record<string, unknown>)
    : {};

  const meetingId = toTrimmedString(object.id);
  const meetingUuid = toTrimmedString(object.uuid);
  const topic = toTrimmedString(object.topic);
  const accountId = toTrimmedString(body.payload?.account_id);

  return {
    meetingId: meetingId || undefined,
    meetingUuid: meetingUuid || undefined,
    topic: topic || undefined,
    accountId: accountId || undefined
  };
}

function parseEventTimestamp(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function triggerZoomDriveAutoSyncFromWebhook(eventName: string, context: {
  meetingId?: string;
  meetingUuid?: string;
  topic?: string;
  accountId?: string;
}) {
  const apiBaseUrl = (env.ZOOM_DRIVE_SYNC_API_BASE_URL ?? "").trim();
  if (!apiBaseUrl) {
    logger.warn("Webhook Zoom: ZOOM_DRIVE_SYNC_API_BASE_URL no definido; se omite auto-sync.", {
      event: eventName,
      ...context
    });
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = buildBackendSyncConfig({});
  } catch (error) {
    logger.error("Webhook Zoom: no se pudo construir configuracion para auto-sync.", {
      event: eventName,
      ...context,
      error: error instanceof Error ? error.message : String(error)
    });
    return;
  }

  const connection: ZoomDriveSyncProxyConnection = {
    apiBaseUrl,
    apiKey: (env.ZOOM_DRIVE_SYNC_API_KEY ?? "").trim() || undefined
  };

  const syncResult = await proxyToSyncBackend<ZoomDriveSyncRunResponse>(
    "/api/v1/zoom-drive-sync/sync",
    connection,
    config
  );

  if (!syncResult.ok) {
    const failure = syncResult.json as { error?: string };
    logger.error("Webhook Zoom: auto-sync fallo.", {
      event: eventName,
      ...context,
      status: syncResult.status,
      error: failure.error ?? "Error desconocido"
    });
    return;
  }

  const result = syncResult.json as ZoomDriveSyncRunResponse;
  logger.info("Webhook Zoom: auto-sync completado.", {
    event: eventName,
    ...context,
    elapsedSeconds: result.elapsedSeconds,
    result: result.result
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const body = parseWebhookPayload(rawBody);

  if (!body) {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }

  const eventName = toTrimmedString(body.event);
  if (!eventName) {
    return NextResponse.json({ error: "Falta el campo event." }, { status: 400 });
  }

  const secretToken = (env.ZOOM_WEBHOOK_SECRET_TOKEN ?? "").trim();
  if (!secretToken) {
    logger.error("Webhook Zoom recibido sin ZOOM_WEBHOOK_SECRET_TOKEN configurado.", {
      event: eventName
    });
    return NextResponse.json(
      { error: "ZOOM_WEBHOOK_SECRET_TOKEN no configurado en el servidor." },
      { status: 503 }
    );
  }

  const signatureVerification = verifyZoomSignature(rawBody, request, secretToken);
  if (!signatureVerification.ok) {
    logger.warn("Webhook Zoom rechazado por firma invalida.", {
      event: eventName,
      reason: signatureVerification.error
    });
    return NextResponse.json({ error: signatureVerification.error }, { status: 401 });
  }

  if (eventName === "endpoint.url_validation") {
    const plainToken = toTrimmedString(body.payload?.plainToken);
    if (!plainToken) {
      return NextResponse.json(
        { error: "Falta payload.plainToken en endpoint.url_validation." },
        { status: 400 }
      );
    }

    const encryptedToken = sha256Hex(secretToken, plainToken);
    logger.info("Webhook Zoom: endpoint.url_validation resuelto correctamente.");
    return NextResponse.json({ plainToken, encryptedToken });
  }

  if (RECORDING_EVENTS.has(eventName)) {
    const context = extractRecordingContext(body);
    const eventTs = parseEventTimestamp(body.event_ts);
    const shouldAutoSync =
      asBoolean(env.ZOOM_DRIVE_AUTO_DOWNLOAD_FROM_WEBHOOK, false) &&
      AUTO_SYNC_EVENTS.has(eventName);

    logger.info("Webhook Zoom: evento de grabacion recibido.", {
      event: eventName,
      eventTs,
      ...context,
      autoSyncEnabled: shouldAutoSync
    });

    after(async () => {
      const tasks: Array<Promise<unknown>> = [
        createAdminZoomRecordingNotifications({
          eventName,
          eventTs,
          accountId: context.accountId,
          meetingId: context.meetingId,
          meetingUuid: context.meetingUuid,
          topic: context.topic,
          autoSyncEnabled: shouldAutoSync
        })
      ];

      if (shouldAutoSync) {
        tasks.push(triggerZoomDriveAutoSyncFromWebhook(eventName, context));
      }

      await Promise.allSettled(tasks);
    });
  } else if (eventName.startsWith("recording.")) {
    logger.warn("Webhook Zoom: evento recording.* no reconocido en whitelist.", {
      event: eventName
    });
  } else {
    logger.info("Webhook Zoom: evento recibido.", { event: eventName });
  }

  return NextResponse.json({
    ok: true,
    received: true,
    event: eventName
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "zoom-webhook",
    endpoint: "/api/v1/zoom/webhook",
    time: new Date().toISOString()
  });
}
