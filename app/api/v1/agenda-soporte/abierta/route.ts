import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess =
    user.role === UserRole.ASISTENTE_ZOOM ||
    user.role === UserRole.SOPORTE_ZOOM;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = new SalasService();
  const agenda = await service.listOpenAgenda(user);
  return NextResponse.json({ agenda });
}
