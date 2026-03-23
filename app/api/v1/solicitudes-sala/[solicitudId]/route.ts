import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

export async function DELETE(_request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canDelete =
    user.role === UserRole.DOCENTE ||
    user.role === UserRole.ADMINISTRADOR;
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { solicitudId } = await context.params;
    const service = new SalasService();
    const result = await service.deleteSolicitud(user, solicitudId);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo eliminar la solicitud." },
      { status: 400 }
    );
  }
}
