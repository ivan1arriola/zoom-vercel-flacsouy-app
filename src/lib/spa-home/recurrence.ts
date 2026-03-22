export type ZoomRecurrenceType = "1" | "2" | "3";
export type ZoomMonthlyMode = "DAY_OF_MONTH" | "WEEKDAY_OF_MONTH";

export const zoomWeekdayOptions: Array<{ value: string; label: string }> = [
  { value: "1", label: "Dom" },
  { value: "2", label: "Lun" },
  { value: "3", label: "Mar" },
  { value: "4", label: "Mie" },
  { value: "5", label: "Jue" },
  { value: "6", label: "Vie" },
  { value: "7", label: "Sab" }
];

export const zoomMonthlyWeekOptions: Array<{ value: string; label: string }> = [
  { value: "1", label: "Primera" },
  { value: "2", label: "Segunda" },
  { value: "3", label: "Tercera" },
  { value: "4", label: "Cuarta" },
  { value: "-1", label: "Ultima" }
];

export function parseWeekdaysCsv(csv: string): number[] {
  const unique = new Set<number>();
  for (const part of csv.split(",")) {
    const value = Number(part.trim());
    if (Number.isInteger(value) && value >= 1 && value <= 7) {
      unique.add(value);
    }
  }
  return [...unique].sort((a, b) => a - b);
}

export function getZoomWeekday(date: Date): number {
  return date.getDay() + 1;
}

function addDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDay(base: Date): Date {
  const copy = new Date(base);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function withTimeOf(baseDay: Date, template: Date): Date {
  const copy = new Date(baseDay);
  copy.setHours(
    template.getHours(),
    template.getMinutes(),
    template.getSeconds(),
    template.getMilliseconds()
  );
  return copy;
}

function getNthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  monthlyWeek: -1 | 1 | 2 | 3 | 4,
  monthlyWeekDay: number,
  timeTemplate: Date
): Date | null {
  const targetJsWeekday = monthlyWeekDay - 1;

  if (monthlyWeek === -1) {
    const lastDay = new Date(
      year,
      monthIndex + 1,
      0,
      timeTemplate.getHours(),
      timeTemplate.getMinutes(),
      timeTemplate.getSeconds(),
      timeTemplate.getMilliseconds()
    );
    const delta = (lastDay.getDay() - targetJsWeekday + 7) % 7;
    lastDay.setDate(lastDay.getDate() - delta);
    return lastDay;
  }

  const firstDay = new Date(
    year,
    monthIndex,
    1,
    timeTemplate.getHours(),
    timeTemplate.getMinutes(),
    timeTemplate.getSeconds(),
    timeTemplate.getMilliseconds()
  );
  const delta = (targetJsWeekday - firstDay.getDay() + 7) % 7;
  const dayNumber = 1 + delta + (monthlyWeek - 1) * 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  if (dayNumber > daysInMonth) return null;

  return new Date(
    year,
    monthIndex,
    dayNumber,
    timeTemplate.getHours(),
    timeTemplate.getMinutes(),
    timeTemplate.getSeconds(),
    timeTemplate.getMilliseconds()
  );
}

export function buildRecurringStarts(params: {
  firstStart: Date;
  recurrenceEnd: Date;
  recurrenceType: ZoomRecurrenceType;
  repeatInterval: number;
  weeklyDays: number[];
  monthlyMode: ZoomMonthlyMode;
  monthlyDay: number;
  monthlyWeek: -1 | 1 | 2 | 3 | 4;
  monthlyWeekDay: number;
}): Date[] {
  const {
    firstStart,
    recurrenceEnd,
    recurrenceType,
    repeatInterval,
    weeklyDays,
    monthlyMode,
    monthlyDay,
    monthlyWeek,
    monthlyWeekDay
  } = params;

  const starts: Date[] = [];
  if (recurrenceEnd < firstStart) return starts;

  if (recurrenceType === "1") {
    let cursor = new Date(firstStart);
    while (cursor <= recurrenceEnd && starts.length < 51) {
      starts.push(new Date(cursor));
      cursor = addDays(cursor, repeatInterval);
    }
    return starts;
  }

  if (recurrenceType === "2") {
    const activeDays = new Set(weeklyDays);
    const firstWeekday = getZoomWeekday(firstStart);
    if (!activeDays.has(firstWeekday)) {
      activeDays.add(firstWeekday);
    }

    const dayMs = 24 * 60 * 60 * 1000;
    let dayCursor = startOfDay(firstStart);
    const endDay = startOfDay(recurrenceEnd);
    const firstWeekStart = startOfDay(firstStart);
    firstWeekStart.setDate(firstWeekStart.getDate() - firstWeekStart.getDay());

    while (dayCursor <= endDay && starts.length < 51) {
      const zoomDay = dayCursor.getDay() + 1;
      if (activeDays.has(zoomDay)) {
        const weekStart = startOfDay(dayCursor);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekDiff = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / (7 * dayMs));
        if (weekDiff % repeatInterval === 0) {
          const candidate = withTimeOf(dayCursor, firstStart);
          if (candidate >= firstStart && candidate <= recurrenceEnd) {
            starts.push(candidate);
          }
        }
      }
      dayCursor = addDays(dayCursor, 1);
    }

    return starts;
  }

  let monthOffset = 0;
  while (starts.length < 51 && monthOffset <= 600) {
    const monthBase = new Date(firstStart.getFullYear(), firstStart.getMonth() + monthOffset, 1);
    if (monthBase > recurrenceEnd && monthOffset > 0) break;

    let candidate: Date | null = null;
    if (monthlyMode === "DAY_OF_MONTH") {
      const daysInMonth = new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0).getDate();
      if (monthlyDay <= daysInMonth) {
        candidate = new Date(
          monthBase.getFullYear(),
          monthBase.getMonth(),
          monthlyDay,
          firstStart.getHours(),
          firstStart.getMinutes(),
          firstStart.getSeconds(),
          firstStart.getMilliseconds()
        );
      }
    } else {
      candidate = getNthWeekdayOfMonth(
        monthBase.getFullYear(),
        monthBase.getMonth(),
        monthlyWeek,
        monthlyWeekDay,
        firstStart
      );
    }

    if (candidate && candidate >= firstStart && candidate <= recurrenceEnd) {
      starts.push(candidate);
    }

    monthOffset += repeatInterval;
  }

  return starts;
}

export function buildRecurrenceSummary(params: {
  recurrenceType: ZoomRecurrenceType;
  repeatInterval: number;
  weeklyDays: number[];
  monthlyMode: ZoomMonthlyMode;
  monthlyDay: number;
  monthlyWeek: -1 | 1 | 2 | 3 | 4;
  monthlyWeekDay: number;
  totalInstancias: number;
  fechaFinal: string;
}): string {
  const {
    recurrenceType,
    repeatInterval,
    weeklyDays,
    monthlyMode,
    monthlyDay,
    monthlyWeek,
    monthlyWeekDay,
    totalInstancias,
    fechaFinal
  } = params;

  if (recurrenceType === "1") {
    return `Recurrencia Zoom diaria cada ${repeatInterval} dia(s) hasta ${fechaFinal} (${totalInstancias} instancias).`;
  }

  if (recurrenceType === "2") {
    const labels = weeklyDays
      .map((day) => zoomWeekdayOptions.find((option) => Number(option.value) === day)?.label ?? String(day))
      .join(", ");
    return `Recurrencia Zoom semanal cada ${repeatInterval} semana(s), dias ${labels}, hasta ${fechaFinal} (${totalInstancias} instancias).`;
  }

  if (monthlyMode === "DAY_OF_MONTH") {
    return `Recurrencia Zoom mensual cada ${repeatInterval} mes(es), dia ${monthlyDay}, hasta ${fechaFinal} (${totalInstancias} instancias).`;
  }

  const weekLabel =
    zoomMonthlyWeekOptions.find((option) => Number(option.value) === monthlyWeek)?.label ??
    String(monthlyWeek);
  const dayLabel =
    zoomWeekdayOptions.find((option) => Number(option.value) === monthlyWeekDay)?.label ??
    String(monthlyWeekDay);
  return `Recurrencia Zoom mensual cada ${repeatInterval} mes(es), ${weekLabel} ${dayLabel}, hasta ${fechaFinal} (${totalInstancias} instancias).`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(date)
    .replace(",", "");
}

export function formatDuration(startIso: string, endIso: string): string {
  const minutes = Math.max(0, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
