import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { notifyAdminInAppMovement } from "@/src/lib/admin-notifications.client";
import { EmailClient } from "@/src/lib/email.client";
import { logger } from "@/src/lib/logger";
import { SUPPORT_EMAIL } from "@/src/lib/support-contact";

export const runtime = "nodejs";

const REPORT_SOURCE_VALUES = [
  "window.error",
  "window.unhandledrejection",
  "next.error",
  "next.global-error",
  "manual"
] as const;

const reportSchema = z.object({
  source: z.enum(REPORT_SOURCE_VALUES),
  message: z.string().trim().min(1).max(2000),
  stack: z.string().trim().max(15000).optional(),
  digest: z.string().trim().max(200).optional(),
  url: z.string().trim().url().max(2000).optional(),
  userAgent: z.string().trim().max(2000).optional(),
  timestamp: z.string().trim().max(80).optional()
});

const REPORT_DEDUP_WINDOW_MS = 10 * 60 * 1000;
const recentReportFingerprints = new Map<string, number>();

function cleanOptional(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeForwardedIp(value: string | null): string | undefined {
  const normalized = cleanOptional(value ?? undefined);
  if (!normalized) return undefined;
  return normalized.split(",")[0]?.trim() || undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildReportFingerprint(input: z.infer<typeof reportSchema>): string {
  const normalized = [input.source, input.message, input.digest ?? "", input.url ?? "", input.stack ?? ""].join(
    "|"
  );
  return createHash("sha256").update(normalized).digest("hex");
}

function wasRecentlyReported(fingerprint: string): boolean {
  const now = Date.now();
  for (const [key, timestamp] of recentReportFingerprints.entries()) {
    if (now - timestamp > REPORT_DEDUP_WINDOW_MS) {
      recentReportFingerprints.delete(key);
    }
  }

  const previous = recentReportFingerprints.get(fingerprint);
  if (previous && now - previous <= REPORT_DEDUP_WINDOW_MS) {
    return true;
  }

  recentReportFingerprints.set(fingerprint, now);
  return false;
}

function buildReportHtml(params: {
  source: string;
  message: string;
  stack?: string;
  digest?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  ip?: string;
  userEmail?: string;
  userRole?: string;
}) {
  const lines = [
    ["Fuente", params.source],
    ["Mensaje", params.message],
    ["Digest", params.digest],
    ["URL", params.url],
    ["Timestamp cliente", params.timestamp],
    ["Usuario autenticado", params.userEmail],
    ["Rol", params.userRole],
    ["IP origen", params.ip],
    ["User-Agent", params.userAgent]
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  const stackBlock = params.stack
    ? `<h3 style="margin:18px 0 8px;">Stack</h3><pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e2e8f0;padding:12px;border-radius:8px;">${escapeHtml(params.stack)}</pre>`
    : "";

  const details = lines
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 10px;border:1px solid #e2e8f0;background:#f8fafc;"><strong>${escapeHtml(label)}</strong></td><td style="padding:8px 10px;border:1px solid #e2e8f0;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;">
      <h2 style="margin:0 0 12px;">Alerta de error - FLACSO Zoom APP</h2>
      <table style="border-collapse:collapse;width:100%;max-width:900px;font-size:14px;">
        ${details}
      </table>
      ${stackBlock}
    </div>
  `;
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Payload de error invalido." }, { status: 400 });
  }

  const input = parsed.data;
  const fingerprint = buildReportFingerprint(input);
  const duplicate = wasRecentlyReported(fingerprint);
  const user = await getSessionUser().catch(() => null);
  const ip =
    normalizeForwardedIp(request.headers.get("x-forwarded-for")) ??
    normalizeForwardedIp(request.headers.get("x-real-ip"));

  if (!duplicate) {
    const emailClient = new EmailClient();
    const subject = `Alerta de error app (${input.source})`;

    const html = buildReportHtml({
      source: input.source,
      message: input.message,
      stack: cleanOptional(input.stack),
      digest: cleanOptional(input.digest),
      url: cleanOptional(input.url),
      userAgent: cleanOptional(input.userAgent),
      timestamp: cleanOptional(input.timestamp),
      ip,
      userEmail: user?.email,
      userRole: user?.role
    });

    try {
      await emailClient.send({
        to: SUPPORT_EMAIL,
        subject,
        html
      });
    } catch (error) {
      logger.error("No se pudo enviar alerta de error al correo de soporte.", {
        source: input.source,
        message: input.message,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      await notifyAdminInAppMovement({
        action: "APP_ERROR_REPORTED",
        actorEmail: user?.email,
        actorFirstName: user?.firstName,
        actorLastName: user?.lastName,
        actorRole: user?.role,
        entityType: "APP_ERROR",
        entityId: cleanOptional(input.digest),
        summary: input.message,
        details: {
          source: input.source,
          url: cleanOptional(input.url),
          ip,
          hasStack: Boolean(cleanOptional(input.stack))
        }
      });
    } catch (error) {
      logger.error("No se pudo registrar alerta interna de error para administradores.", {
        source: input.source,
        message: input.message,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return NextResponse.json({
    ok: true,
    duplicate
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "support-error-report",
    endpoint: "/api/v1/support/error-report",
    supportEmail: SUPPORT_EMAIL
  });
}
