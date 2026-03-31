import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

const patchBodySchema = z.object({
  motivo: z.string().trim().max(240).optional().or(z.literal(""))
});

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

export async function PATCH(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { solicitudId } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos." },
      { status: 400 }
    );
  }

  try {
    const service = new SalasService();
    const result = await service.enableSolicitudAssistance(user, solicitudId, {
      motivo: typeof parsed.data.motivo === "string" ? parsed.data.motivo : undefined
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo actualizar la solicitud." },
      { status: 400 }
    );
  }
}
