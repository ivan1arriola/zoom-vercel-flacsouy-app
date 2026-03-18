import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = new SalasService();
  const requests = await service.listSolicitudes(user);
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canCreate =
    user.role === UserRole.DOCENTE ||
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.SOPORTE_ZOOM;
  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const service = new SalasService();
    const created = await service.createSolicitud(user, body);
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo crear la solicitud." },
      { status: 400 }
    );
  }
}
