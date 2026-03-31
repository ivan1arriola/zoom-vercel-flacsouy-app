import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canSend =
    user.role === UserRole.DOCENTE ||
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.CONTADURIA;
  if (!canSend) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { solicitudId } = await context.params;
    const body = (await request.json()) as {
      toEmail?: string;
      mensaje?: string;
    };

    const service = new SalasService();
    const result = await service.sendSolicitudReminder(user, solicitudId, {
      toEmail: body.toEmail,
      mensaje: body.mensaje
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo enviar el recordatorio." },
      { status: 400 }
    );
  }
}
