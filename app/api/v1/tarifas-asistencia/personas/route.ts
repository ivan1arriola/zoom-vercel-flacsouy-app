import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAssistant = user.role === UserRole.ASISTENTE_ZOOM;
  const isDocente = user.role === UserRole.DOCENTE;
  const canAccess =
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.CONTADURIA ||
    isAssistant ||
    isDocente;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedUserId = (url.searchParams.get("userId") ?? "").trim() || undefined;
  const effectiveUserId = (isAssistant || isDocente) ? user.id : requestedUserId;

  const service = new SalasService();
  const payload = await service.listPersonMeetingHours({ userId: effectiveUserId });

  if (isAssistant) {
    const ownPerson = payload.people.find((person) => person.userId === user.id) ?? null;
    const ownSummary = payload.assistantSummaries?.find((summary) => summary.userId === user.id) ?? null;
    const currentMonthKey = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: "America/Montevideo"
    })
      .formatToParts(new Date())
      .reduce((acc, part) => {
        if (part.type === "year") acc.year = part.value;
        if (part.type === "month") acc.month = part.value;
        return acc;
      }, { year: "0000", month: "01" } as { year: string; month: string });
    const currentMonth = `${currentMonthKey.year}-${currentMonthKey.month}`;
    const ownMonthKeys = (ownSummary?.months ?? [])
      .map((month) => month.monthKey)
      .filter((monthKey) => monthKey < currentMonth)
      .filter((monthKey) => monthKey.length > 0)
      .sort((a, b) => b.localeCompare(a));
    return NextResponse.json({
      ...payload,
      people: ownPerson ? [ownPerson] : [],
      selectedUserId: ownPerson?.userId ?? null,
      selectedPerson: ownPerson,
      availableMonthKeys: ownMonthKeys,
      assistantSummaries: ownSummary ? [ownSummary] : []
    });
  }

  return NextResponse.json(payload);
}
