import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAssistant = user.role === UserRole.ASISTENTE_ZOOM;
  const canAccess =
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.CONTADURIA ||
    isAssistant;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedUserId = (url.searchParams.get("userId") ?? "").trim() || undefined;
  const effectiveUserId = isAssistant ? user.id : requestedUserId;

  const service = new SalasService();
  const payload = await service.listPersonMeetingHours({ userId: effectiveUserId });

  if (isAssistant) {
    const ownPerson = payload.people.find((person) => person.userId === user.id) ?? null;
    return NextResponse.json({
      ...payload,
      people: ownPerson ? [ownPerson] : [],
      selectedUserId: ownPerson?.userId ?? null,
      selectedPerson: ownPerson
    });
  }

  return NextResponse.json(payload);
}
