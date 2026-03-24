import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canCancel =
    user.role === UserRole.DOCENTE ||
    user.role === UserRole.ADMINISTRADOR;
  if (!canCancel) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { solicitudId } = await context.params;
    const body = (await request.json()) as {
      scope?: "SERIE" | "INSTANCIA";
      eventoId?: string;
      occurrenceId?: string;
      inicioProgramadoAt?: string;
      motivo?: string;
    };

    if (body.scope !== "SERIE" && body.scope !== "INSTANCIA") {
      return NextResponse.json(
        { error: "scope debe ser SERIE o INSTANCIA." },
        { status: 400 }
      );
    }

    const service = new SalasService();
    const result = await service.cancelSolicitud(user, solicitudId, {
      scope: body.scope,
      eventoId: body.eventoId,
      occurrenceId: body.occurrenceId,
      inicioProgramadoAt: body.inicioProgramadoAt,
      motivo: body.motivo
    });

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo cancelar la solicitud." },
      { status: 400 }
    );
  }
}
