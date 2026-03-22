import { EstadoInteresAsistente, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventoId: string }> };

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess =
    user.role === UserRole.ASISTENTE_ZOOM ||
    user.role === UserRole.SOPORTE_ZOOM;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { eventoId } = await context.params;
    const body = (await request.json()) as {
      estadoInteres: EstadoInteresAsistente;
      comentario?: string;
    };

    if (!Object.values(EstadoInteresAsistente).includes(body.estadoInteres)) {
      return NextResponse.json({ error: "estadoInteres inválido." }, { status: 400 });
    }

    const service = new SalasService();
    const interest = await service.setInterest(user, eventoId, body);
    return NextResponse.json({ interest });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo registrar interés." },
      { status: 400 }
    );
  }
}
