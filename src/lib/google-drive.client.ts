import { google } from "googleapis";
import { env } from "./env";
import {
  resolveGoogleServiceAccountCredentials,
  toReadableGoogleAuthError
} from "./google-service-account";

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

function buildGoogleJwtAuth() {
  const credentials = resolveGoogleServiceAccountCredentials();

  return new google.auth.JWT({
    email: credentials.email,
    key: credentials.privateKey,
    scopes: DRIVE_READONLY_SCOPES,
    subject: credentials.subject
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
  try {
    await auth.authorize();
  } catch (error) {
    throw new Error(toReadableGoogleAuthError(error));
  }
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
