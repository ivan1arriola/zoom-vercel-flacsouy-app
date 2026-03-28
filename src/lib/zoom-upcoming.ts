type ZoomUnknownRecord = Record<string, unknown>;

export type ZoomMeetingKind = "UNICA" | "RECURRENTE";

export type ZoomUpcomingEvent = {
  id: string;
  meetingId: string | null;
  meetingUuid: string | null;
  occurrenceId: string | null;
  topic: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  timezone: string;
  joinUrl: string;
  status: string;
  meetingType: number | null;
  meetingKind: ZoomMeetingKind;
};

export type ZoomUpcomingOverlap = {
  firstEventId: string;
  secondEventId: string;
  firstStartTime: string;
  secondStartTime: string;
  overlapStartTime: string;
  overlapEndTime: string;
};

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveMeetingType(value: unknown): number | null {
  const directNumber = getNumber(value);
  if (directNumber !== null) return Math.floor(directNumber);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }
  return null;
}

function normalizeMeetingId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  return /^\d{9,13}$/.test(digits) ? digits : null;
}

function resolveOccurrenceId(meeting: ZoomUnknownRecord): string | null {
  const direct = getString(meeting.occurrence_id);
  if (direct) return direct;
  const nested = meeting.occurrenceId;
  if (nested === undefined || nested === null) return null;
  const asString = String(nested).trim();
  return asString || null;
}

function resolveMeetingUuid(meeting: ZoomUnknownRecord): string | null {
  const direct = getString(meeting.uuid);
  if (direct) return direct;
  const nested = meeting.meetingUuid;
  if (nested === undefined || nested === null) return null;
  const asString = String(nested).trim();
  return asString || null;
}

function getMeetingKindByType(meetingType: number | null): ZoomMeetingKind {
  if (meetingType === 3 || meetingType === 8) return "RECURRENTE";
  return "UNICA";
}

function normalizeDurationMinutes(raw: unknown): number {
  const parsed = getNumber(raw);
  if (parsed !== null) return Math.max(1, Math.floor(parsed));
  if (typeof raw === "string" && raw.trim()) {
    const fromString = Number(raw);
    if (Number.isFinite(fromString)) return Math.max(1, Math.floor(fromString));
  }
  return 60;
}

function toIsoOrEmpty(value: Date): string {
  return Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

export function normalizeZoomUpcomingEvents(
  meetings: ZoomUnknownRecord[]
): ZoomUpcomingEvent[] {
  const result: ZoomUpcomingEvent[] = [];
  for (const meeting of meetings) {
    const startRaw = getString(meeting.start_time);
    const startDate = new Date(startRaw);
    if (!startRaw || Number.isNaN(startDate.getTime())) continue;

    const durationMinutes = normalizeDurationMinutes(meeting.duration);
    const meetingType = resolveMeetingType(meeting.type);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60_000);
    const meetingId = normalizeMeetingId(meeting.id);
    const meetingUuid = resolveMeetingUuid(meeting);
    const occurrenceId = resolveOccurrenceId(meeting);
    const uniqueRowId = [meetingId ?? `${startDate.getTime()}`, occurrenceId ?? startDate.toISOString()].join(":");

    result.push({
      id: uniqueRowId,
      meetingId,
      meetingUuid,
      occurrenceId,
      topic: getString(meeting.topic) || "Sin titulo",
      startTime: startDate.toISOString(),
      endTime: toIsoOrEmpty(endDate),
      durationMinutes,
      timezone: getString(meeting.timezone),
      joinUrl: getString(meeting.join_url),
      status: getString(meeting.status),
      meetingType,
      meetingKind: getMeetingKindByType(meetingType)
    });
  }

  return result.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

export function detectZoomUpcomingOverlaps(
  events: ZoomUpcomingEvent[]
): {
  overlapCount: number;
  overlappingEventIds: string[];
  overlaps: ZoomUpcomingOverlap[];
} {
  const overlaps: ZoomUpcomingOverlap[] = [];
  const conflictIds = new Set<string>();

  for (let i = 0; i < events.length; i += 1) {
    const current = events[i];
    const currentStart = new Date(current.startTime).getTime();
    const currentEnd = new Date(current.endTime).getTime();
    if (!Number.isFinite(currentStart) || !Number.isFinite(currentEnd)) continue;

    for (let j = i + 1; j < events.length; j += 1) {
      const next = events[j];
      const nextStart = new Date(next.startTime).getTime();
      const nextEnd = new Date(next.endTime).getTime();
      if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) continue;

      if (nextStart >= currentEnd) {
        break;
      }

      const overlapStart = Math.max(currentStart, nextStart);
      const overlapEnd = Math.min(currentEnd, nextEnd);
      if (overlapStart >= overlapEnd) continue;

      conflictIds.add(current.id);
      conflictIds.add(next.id);
      overlaps.push({
        firstEventId: current.id,
        secondEventId: next.id,
        firstStartTime: current.startTime,
        secondStartTime: next.startTime,
        overlapStartTime: new Date(overlapStart).toISOString(),
        overlapEndTime: new Date(overlapEnd).toISOString()
      });
    }
  }

  return {
    overlapCount: overlaps.length,
    overlappingEventIds: Array.from(conflictIds),
    overlaps
  };
}
