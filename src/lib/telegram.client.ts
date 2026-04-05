import { env } from "@/src/lib/env";
import { logger } from "@/src/lib/logger";

type TelegramMovementInput = {
  action: string;
  actorEmail?: string;
  actorRole?: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  details?: Record<string, unknown>;
  occurredAt?: Date;
};

const TELEGRAM_MAX_TEXT_LENGTH = 3900;
const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;
const TELEGRAM_MAX_ATTEMPTS = 3;
const TELEGRAM_MAX_DETAIL_LINES = 6;

const DETAIL_PRIORITY: string[] = [
  "titulo",
  "solicitudId",
  "eventoId",
  "meetingId",
  "zoomMeetingId",
  "zoomAccount",
  "responsableNombre",
  "modalidadReunion",
  "requiereAsistencia",
  "toEmail",
  "updatedEvents",
  "cancelledAssignments"
];

function formatDateTime(value: Date): string {
  try {
    return new Intl.DateTimeFormat("es-UY", {
      timeZone: env.TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(value);
  } catch {
    return value.toISOString();
  }
}

function normalizeActionLabel(action: string): string {
  if (!action) return "SIN_ACCION";
  return action
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDetailKey(key: string): string {
  if (!key) return "dato";
  const humanized = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return humanized[0]?.toUpperCase() + humanized.slice(1);
}

function stringifyDetailValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) {
    if (value.length === 0) return "0";
    if (value.length <= 3) return value.map((item) => String(item)).join(", ");
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    try {
      const asRecord = value as Record<string, unknown>;
      const keys = Object.keys(asRecord);
      if (keys.length === 0) return "objeto vacío";
      return `objeto (${keys.length} claves)`;
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatDetails(details?: Record<string, unknown>): string[] {
  if (!details) return [];
  const entries = Object.entries(details).filter(([_key, value]) => value !== undefined && value !== null);
  entries.sort((left, right) => {
    const leftPriority = DETAIL_PRIORITY.indexOf(left[0]);
    const rightPriority = DETAIL_PRIORITY.indexOf(right[0]);
    const normalizedLeft = leftPriority >= 0 ? leftPriority : Number.POSITIVE_INFINITY;
    const normalizedRight = rightPriority >= 0 ? rightPriority : Number.POSITIVE_INFINITY;
    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight;
    }
    return left[0].localeCompare(right[0]);
  });

  const lines: string[] = [];
  const trimmed = entries.slice(0, TELEGRAM_MAX_DETAIL_LINES);
  for (const [key, value] of trimmed) {
    if (value === undefined || value === null) continue;
    lines.push(`- ${normalizeDetailKey(key)}: ${truncate(stringifyDetailValue(value), 180)}`);
  }

  const omitted = entries.length - trimmed.length;
  if (omitted > 0) {
    lines.push(`- +${omitted} dato(s) adicionales`);
  }

  return lines;
}

function buildMovementMessage(input: TelegramMovementInput): string {
  const occurredAt = input.occurredAt ?? new Date();
  const timestamp = formatDateTime(occurredAt);
  const details = formatDetails(input.details);
  const actionLabel = normalizeActionLabel(input.action);
  const headlineParts = [actionLabel];
  if (input.summary) {
    headlineParts.push(truncate(input.summary, 140));
  }

  const lines = [`ZoomApp | ${headlineParts.join(" | ")}`];

  const contextParts: string[] = [`Fecha ${timestamp}`];
  if (input.actorEmail) contextParts.push(`Actor ${input.actorEmail}`);
  if (input.actorRole) contextParts.push(`Rol ${input.actorRole}`);
  if (input.entityType || input.entityId) {
    contextParts.push(`Entidad ${(input.entityType ?? "-")}/${(input.entityId ?? "-")}`);
  }

  lines.push(contextParts.join(" | "));

  if (details.length > 0) {
    lines.push("Datos clave:");
    lines.push(...details);
  }

  return lines.join("\n");
}

function splitMessage(text: string, maxLength = TELEGRAM_MAX_TEXT_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const sliceEnd = Math.min(text.length, cursor + maxLength);
    if (sliceEnd === text.length) {
      chunks.push(text.slice(cursor));
      break;
    }

    const lastLineBreak = text.lastIndexOf("\n", sliceEnd);
    const breakIndex = lastLineBreak > cursor + Math.floor(maxLength * 0.5)
      ? lastLineBreak
      : sliceEnd;

    chunks.push(text.slice(cursor, breakIndex));
    cursor = breakIndex;
    while (cursor < text.length && text[cursor] === "\n") {
      cursor += 1;
    }
  }

  return chunks;
}

function getRetryDelayMs(responseText: string, attempt: number): number {
  try {
    const parsed = JSON.parse(responseText) as { parameters?: { retry_after?: unknown } };
    const retryAfter = Number(parsed.parameters?.retry_after);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }
  } catch {
    // Ignore parse issues and use exponential backoff.
  }

  return 600 * 2 ** Math.max(0, attempt - 1);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramText(token: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true
        }),
        signal: AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS)
      });

      if (response.ok) {
        return;
      }

      const responseText = await response.text().catch(() => "");
      const shouldRetry = response.status === 429 || response.status >= 500;
      if (!shouldRetry || attempt >= TELEGRAM_MAX_ATTEMPTS) {
        logger.warn("No se pudo enviar notificacion a Telegram.", {
          status: response.status,
          attempt,
          responseText
        });
        return;
      }

      await sleep(getRetryDelayMs(responseText, attempt));
    } catch (error) {
      const canRetry = attempt < TELEGRAM_MAX_ATTEMPTS;
      if (!canRetry) {
        logger.warn("Error enviando notificacion a Telegram.", {
          attempt,
          error: error instanceof Error ? error.message : String(error)
        });
        return;
      }
      await sleep(600 * 2 ** Math.max(0, attempt - 1));
    }
  }
}

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

export async function notifyAdminTelegramMovement(input: TelegramMovementInput): Promise<void> {
  if (!isTelegramConfigured()) return;

  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const text = buildMovementMessage(input);
  const chunks = splitMessage(text);

  if (chunks.length === 1) {
    await sendTelegramText(token, chatId, chunks[0]);
    return;
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const prefix = `(${index + 1}/${chunks.length})`;
    const chunkText = `${prefix}\n${chunks[index]}`;
    await sendTelegramText(token, chatId, chunkText);
  }
}
