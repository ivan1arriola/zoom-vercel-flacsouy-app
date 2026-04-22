import { google } from "googleapis";
import { env } from "./env";

const DRIVE_READONLY_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

export type StoredDriveRecording = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  createdTime: string;
  modifiedTime: string;
  size: number | null;
};

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

function buildGoogleJwtAuth() {
  const email = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = (env.GOOGLE_PRIVATE_KEY || "").trim();
  if (!email || !privateKey) {
    throw new Error(
      "Google Drive no esta configurado en Vercel. Define GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY."
    );
  }

  return new google.auth.JWT({
    email,
    key: normalizePrivateKey(privateKey),
    scopes: DRIVE_READONLY_SCOPES,
    subject: (env.GOOGLE_SERVICE_ACCOUNT_SUBJECT || "").trim() || undefined
  });
}

function toStoredDriveRecording(value: Record<string, unknown>): StoredDriveRecording {
  const rawSize = value.size;
  const parsedSize =
    typeof rawSize === "string"
      ? Number(rawSize)
      : typeof rawSize === "number"
        ? rawSize
        : Number.NaN;

  return {
    id: typeof value.id === "string" ? value.id : "",
    name: typeof value.name === "string" ? value.name : "sin_nombre",
    mimeType: typeof value.mimeType === "string" ? value.mimeType : "",
    webViewLink: typeof value.webViewLink === "string" ? value.webViewLink : "",
    createdTime: typeof value.createdTime === "string" ? value.createdTime : "",
    modifiedTime: typeof value.modifiedTime === "string" ? value.modifiedTime : "",
    size: Number.isFinite(parsedSize) ? parsedSize : null
  };
}

export async function listStoredRecordings(params: {
  driveDestinationId?: string;
  pageToken?: string;
  pageSize?: number;
}): Promise<{ driveDestinationId: string; items: StoredDriveRecording[]; nextPageToken?: string }> {
  const folderId = (params.driveDestinationId || env.DRIVE_DESTINATION_ID || "").trim();
  if (!folderId) {
    throw new Error(
      "No se encontro DRIVE_DESTINATION_ID. Indicalo en la vista o define DRIVE_DESTINATION_ID en Vercel."
    );
  }

  const auth = buildGoogleJwtAuth();
  await auth.authorize();
  const drive = google.drive({ version: "v3", auth });

  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields:
      "nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size)",
    orderBy: "createdTime desc",
    pageSize: Math.max(1, Math.min(params.pageSize ?? 40, 200)),
    pageToken: params.pageToken || undefined,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  const files = Array.isArray(response.data.files) ? response.data.files : [];
  const items = files
    .map((item) => toStoredDriveRecording(item as unknown as Record<string, unknown>))
    .filter((item) => item.id);

  return {
    driveDestinationId: folderId,
    items,
    nextPageToken:
      typeof response.data.nextPageToken === "string" && response.data.nextPageToken
        ? response.data.nextPageToken
        : undefined
  };
}
