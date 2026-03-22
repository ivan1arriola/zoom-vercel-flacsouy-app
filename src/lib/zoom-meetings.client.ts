import { env } from "@/src/lib/env";

type ZoomJson = Record<string, unknown>;

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

export type ZoomListUserMeetingsQuery = {
  type?: "scheduled" | "live" | "upcoming" | "upcoming_meetings" | "previous_meetings";
  page_size?: number;
  next_page_token?: string;
  page_number?: number;
  from?: string;
  to?: string;
  timezone?: string;
};

export type ZoomDeleteMeetingQuery = {
  occurrence_id?: string;
  schedule_for_reminder?: boolean;
  cancel_meeting_reminder?: boolean;
};

export type ZoomGetMeetingQuery = {
  occurrence_id?: string;
  show_previous_occurrences?: boolean;
};

export type ZoomUpdateMeetingQuery = {
  occurrence_id?: string;
};

export class ZoomApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: number, details?: unknown) {
    super(message);
    this.name = "ZoomApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function normalizeMeetingIdentifier(meetingId: string): string {
  return encodeURIComponent(meetingId);
}

function normalizePastMeetingIdentifier(meetingIdOrUuid: string): string {
  const encoded = encodeURIComponent(meetingIdOrUuid);
  if (meetingIdOrUuid.startsWith("/") || meetingIdOrUuid.includes("//")) {
    return encodeURIComponent(encoded);
  }
  return encoded;
}

function normalizePath(basePath: string): string {
  return basePath.startsWith("/") ? basePath.slice(1) : basePath;
}

export async function getZoomAccessTokenFromAccountCredentials(): Promise<string> {
  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    throw new Error("Faltan credenciales de Zoom en variables de entorno.");
  }

  const url = new URL("https://zoom.us/oauth/token");
  url.searchParams.set("grant_type", "account_credentials");
  url.searchParams.set("account_id", env.ZOOM_ACCOUNT_ID);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Basic ${toBase64(`${env.ZOOM_CLIENT_ID}:${env.ZOOM_CLIENT_SECRET}`)}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("No se pudo obtener el token de Zoom.");
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Zoom no devolvio access_token.");
  }

  return data.access_token;
}

export class ZoomMeetingsClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(accessToken: string, baseUrl = env.ZOOM_API_BASE) {
    this.accessToken = accessToken;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  static async fromAccountCredentials(): Promise<ZoomMeetingsClient> {
    const token = await getZoomAccessTokenFromAccountCredentials();
    return new ZoomMeetingsClient(token);
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(`${this.baseUrl}/${normalizePath(path)}`);
    if (query) {
      for (const [key, raw] of Object.entries(query)) {
        if (raw === null || raw === undefined || raw === "") continue;
        url.searchParams.set(key, String(raw));
      }
    }
    return url.toString();
  }

  private async parseError(response: Response): Promise<ZoomApiError> {
    const text = await response.text().catch(() => "");
    let json: ZoomJson | null = null;
    if (text) {
      try {
        json = JSON.parse(text) as ZoomJson;
      } catch {
        json = null;
      }
    }

    const message =
      (json?.message as string | undefined) ||
      (json?.error as string | undefined) ||
      `Zoom API error (${response.status})`;
    const codeRaw = json?.code;
    const code = typeof codeRaw === "number" ? codeRaw : undefined;

    return new ZoomApiError(message, response.status, code, json ?? text);
  }

  private async requestJson(
    method: string,
    path: string,
    options?: {
      query?: QueryParams;
      body?: unknown;
      allowNotFound?: boolean;
      allowNoContent?: boolean;
    }
  ): Promise<ZoomJson | null> {
    const response = await fetch(this.buildUrl(path, options?.query), {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    });

    if (options?.allowNotFound && response.status === 404) {
      return null;
    }
    if (options?.allowNoContent && response.status === 204) {
      return {};
    }
    if (!response.ok) {
      throw await this.parseError(response);
    }

    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as ZoomJson;
    } catch {
      return {};
    }
  }

  async createMeeting(userId: string, payload: ZoomJson): Promise<ZoomJson> {
    const data = await this.requestJson("POST", `/users/${encodeURIComponent(userId)}/meetings`, {
      body: payload
    });
    return data ?? {};
  }

  async deleteMeeting(meetingId: string, query?: ZoomDeleteMeetingQuery): Promise<void> {
    await this.requestJson("DELETE", `/meetings/${normalizeMeetingIdentifier(meetingId)}`, {
      query,
      allowNoContent: true
    });
  }

  async getMeeting(meetingId: string, query?: ZoomGetMeetingQuery): Promise<ZoomJson | null> {
    return this.requestJson("GET", `/meetings/${normalizeMeetingIdentifier(meetingId)}`, {
      query,
      allowNotFound: true
    });
  }

  async getMeetingSipDialing(meetingId: string, passcode?: string): Promise<ZoomJson> {
    const body = passcode ? { passcode } : {};
    const data = await this.requestJson("POST", `/meetings/${normalizeMeetingIdentifier(meetingId)}/sip_dialing`, {
      body
    });
    return data ?? {};
  }

  async getPastMeeting(meetingIdOrUuid: string): Promise<ZoomJson | null> {
    return this.requestJson("GET", `/past_meetings/${normalizePastMeetingIdentifier(meetingIdOrUuid)}`, {
      allowNotFound: true
    });
  }

  async getPastMeetingParticipants(
    meetingIdOrUuid: string,
    query?: { page_size?: number; next_page_token?: string }
  ): Promise<ZoomJson | null> {
    return this.requestJson(
      "GET",
      `/past_meetings/${normalizePastMeetingIdentifier(meetingIdOrUuid)}/participants`,
      {
        query,
        allowNotFound: true
      }
    );
  }

  async listUserMeetings(userId: string, query?: ZoomListUserMeetingsQuery): Promise<ZoomJson> {
    const data = await this.requestJson("GET", `/users/${encodeURIComponent(userId)}/meetings`, { query });
    return data ?? {};
  }

  async listPastMeetingInstances(meetingId: string): Promise<ZoomJson | null> {
    return this.requestJson("GET", `/past_meetings/${normalizeMeetingIdentifier(meetingId)}/instances`, {
      allowNotFound: true
    });
  }

  async listPastMeetingQa(meetingIdOrUuid: string): Promise<ZoomJson | null> {
    return this.requestJson("GET", `/past_meetings/${normalizePastMeetingIdentifier(meetingIdOrUuid)}/qa`, {
      allowNotFound: true
    });
  }

  async listUserUpcomingMeetings(userId: string): Promise<ZoomJson> {
    const data = await this.requestJson("GET", `/users/${encodeURIComponent(userId)}/upcoming_meetings`);
    return data ?? {};
  }

  async updateMeeting(meetingId: string, payload: ZoomJson, query?: ZoomUpdateMeetingQuery): Promise<void> {
    await this.requestJson("PATCH", `/meetings/${normalizeMeetingIdentifier(meetingId)}`, {
      body: payload,
      query,
      allowNoContent: true
    });
  }

  async updateMeetingStatus(meetingId: string, action: "end" | "recover"): Promise<void> {
    await this.requestJson("PUT", `/meetings/${normalizeMeetingIdentifier(meetingId)}/status`, {
      body: { action },
      allowNoContent: true
    });
  }

  async updateLiveMeetingRtmsAppStatus(meetingId: string, payload: ZoomJson): Promise<void> {
    await this.requestJson("PATCH", `/live_meetings/${normalizeMeetingIdentifier(meetingId)}/rtms_app/status`, {
      body: payload,
      allowNoContent: true
    });
  }

  async getGroup(groupId: string): Promise<ZoomJson | null> {
    return this.requestJson("GET", `/groups/${encodeURIComponent(groupId)}`, {
      allowNotFound: true
    });
  }

  async listGroupMembers(groupId: string, pageSize = 300): Promise<Array<Record<string, unknown>>> {
    const members: Array<Record<string, unknown>> = [];
    let nextPageToken = "";

    do {
      const data = await this.requestJson("GET", `/groups/${encodeURIComponent(groupId)}/members`, {
        query: {
          page_size: pageSize,
          next_page_token: nextPageToken || undefined
        }
      });

      const pageMembers = Array.isArray(data?.members)
        ? (data?.members as Array<Record<string, unknown>>)
        : [];
      members.push(...pageMembers);
      nextPageToken = typeof data?.next_page_token === "string" ? data.next_page_token : "";
    } while (nextPageToken);

    return members;
  }
}
