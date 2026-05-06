import { env } from "./env";

type ParsedServiceAccountBlob = {
  clientEmail: string;
  privateKey: string;
};

export type GoogleServiceAccountCredentials = {
  email: string;
  privateKey: string;
  subject?: string;
  source: "pair" | "json_blob";
};

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function normalizePrivateKey(raw: string): string {
  return stripWrappingQuotes(raw).replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trim();
}

function parsePrivateKeyBlob(raw: string): ParsedServiceAccountBlob | null {
  const candidate = stripWrappingQuotes(raw);
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
    const privateKey = typeof parsed.private_key === "string" ? parsed.private_key.trim() : "";
    if (!clientEmail || !privateKey) {
      return null;
    }
    return {
      clientEmail,
      privateKey
    };
  } catch {
    return null;
  }
}

function assertPrivateKeyShape(privateKey: string): void {
  if (!privateKey.includes("BEGIN PRIVATE KEY") || !privateKey.includes("END PRIVATE KEY")) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY no tiene formato PEM valido. Debe incluir BEGIN/END PRIVATE KEY."
    );
  }
}

export function resolveGoogleServiceAccountCredentials(): GoogleServiceAccountCredentials {
  const envEmail = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
  const rawPrivateKey = (env.GOOGLE_PRIVATE_KEY ?? "").trim();
  const subject = (env.GOOGLE_SERVICE_ACCOUNT_SUBJECT ?? "").trim() || undefined;

  if (!rawPrivateKey) {
    throw new Error("Google Service Account no configurado. Define GOOGLE_PRIVATE_KEY.");
  }

  const blob = parsePrivateKeyBlob(rawPrivateKey);
  if (blob) {
    const privateKey = normalizePrivateKey(blob.privateKey);
    assertPrivateKeyShape(privateKey);
    return {
      email: blob.clientEmail,
      privateKey,
      subject,
      source: "json_blob"
    };
  }

  if (!envEmail) {
    throw new Error("Google Service Account no configurado. Define GOOGLE_SERVICE_ACCOUNT_EMAIL.");
  }

  const privateKey = normalizePrivateKey(rawPrivateKey);
  assertPrivateKeyShape(privateKey);
  return {
    email: envEmail,
    privateKey,
    subject,
    source: "pair"
  };
}

export function toReadableGoogleAuthError(error: unknown): string {
  const originalMessage = error instanceof Error ? error.message : String(error);
  const normalized = originalMessage.toLowerCase();

  if (normalized.includes("no valid verifier for issuer")) {
    return (
      "Google rechazo el Service Account (invalid_grant: No valid verifier for issuer). " +
      "Verifica que GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY pertenezcan al mismo Service Account activo " +
      "y que la clave privada no haya sido revocada."
    );
  }

  if (normalized.includes("invalid_grant") && normalized.includes("not a valid email")) {
    return (
      "Google rechazo la cuenta impersonada (subject). Revisa GOOGLE_SERVICE_ACCOUNT_SUBJECT " +
      "y confirma que sea un usuario real de Google Workspace."
    );
  }

  if (normalized.includes("delegation denied")) {
    return (
      "Google rechazo la delegacion de dominio. Habilita Domain-wide Delegation para el Service Account " +
      "y agrega el scope requerido en Admin Console."
    );
  }

  if (normalized.includes("unauthorized_client")) {
    return (
      "El Service Account no esta autorizado para ese scope/API. Revisa Domain-wide Delegation y scopes permitidos."
    );
  }

  return `Fallo autenticacion con Google Service Account: ${originalMessage}`;
}
