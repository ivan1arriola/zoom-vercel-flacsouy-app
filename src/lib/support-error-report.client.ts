"use client";

export type SupportErrorReportSource =
  | "window.error"
  | "window.unhandledrejection"
  | "next.error"
  | "next.global-error"
  | "manual";

export type SupportErrorReportPayload = {
  source: SupportErrorReportSource;
  message: string;
  stack?: string;
  digest?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
};

const REPORT_ENDPOINT = "/api/v1/support/error-report";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function toSerializableError(reason: unknown): { message: string; stack?: string } {
  if (reason instanceof Error) {
    return {
      message: cleanString(reason.message) ?? "Error sin mensaje",
      stack: cleanString(reason.stack)
    };
  }

  if (typeof reason === "string") {
    return { message: cleanString(reason) ?? "Error sin mensaje" };
  }

  if (reason && typeof reason === "object") {
    const maybeMessage = cleanString((reason as { message?: unknown }).message);
    const maybeStack = cleanString((reason as { stack?: unknown }).stack);
    if (maybeMessage || maybeStack) {
      return {
        message: maybeMessage ?? "Error sin mensaje",
        stack: maybeStack
      };
    }
  }

  try {
    const asJson = JSON.stringify(reason);
    if (asJson) {
      return {
        message: truncate(asJson, 1000)
      };
    }
  } catch {
    // noop
  }

  return { message: "Error no serializable" };
}

export async function reportSupportError(payload: SupportErrorReportPayload): Promise<void> {
  const normalizedMessage = cleanString(payload.message) ?? "Error sin mensaje";
  const body: SupportErrorReportPayload = {
    ...payload,
    message: truncate(normalizedMessage, 2000),
    stack: cleanString(payload.stack),
    digest: cleanString(payload.digest),
    url: cleanString(payload.url) ?? (typeof window !== "undefined" ? window.location.href : undefined),
    userAgent:
      cleanString(payload.userAgent) ??
      (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
    timestamp: cleanString(payload.timestamp) ?? new Date().toISOString()
  };

  try {
    await fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      keepalive: true
    });
  } catch {
    // No bloqueamos la UI por errores de reporte.
  }
}
