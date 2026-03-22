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

function formatDetails(details?: Record<string, unknown>): string[] {
  if (!details) return [];
  const lines: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
  }
  return lines;
}

function buildMovementMessage(input: TelegramMovementInput): string {
  const timestamp = (input.occurredAt ?? new Date()).toISOString();
  const lines = [
    "ZoomApp - Movimiento",
    `accion: ${input.action}`,
    `fecha: ${timestamp}`
  ];

  if (input.actorEmail) lines.push(`actor: ${input.actorEmail}`);
  if (input.actorRole) lines.push(`rol: ${input.actorRole}`);
  if (input.entityType) lines.push(`entidad: ${input.entityType}`);
  if (input.entityId) lines.push(`id: ${input.entityId}`);
  if (input.summary) lines.push(`resumen: ${input.summary}`);

  lines.push(...formatDetails(input.details));
  return lines.join("\n");
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
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

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
      })
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      logger.warn("No se pudo enviar notificacion a Telegram.", {
        status: response.status,
        responseText
      });
    }
  } catch (error) {
    logger.warn("Error enviando notificacion a Telegram.", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
