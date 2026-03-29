import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventoId: string }> };

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { eventoId } = await context.params;
    const body = (await request.json()) as { asistenteZoomId: string; motivoAsignacion?: string };

    if (!body.asistenteZoomId) {
      return NextResponse.json({ error: "asistenteZoomId es obligatorio." }, { status: 400 });
    }

    const service = new SalasService();
    const assignment = await service.assignAssistant(user, eventoId, body);
    return NextResponse.json({ assignment });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo asignar asistencia." },
      { status: 400 }
    );
  }
}
