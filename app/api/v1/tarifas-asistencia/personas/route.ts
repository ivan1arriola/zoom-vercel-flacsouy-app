import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = (url.searchParams.get("userId") ?? "").trim() || undefined;

  const service = new SalasService();
  const payload = await service.listPersonMeetingHours({ userId });
  return NextResponse.json(payload);
}

