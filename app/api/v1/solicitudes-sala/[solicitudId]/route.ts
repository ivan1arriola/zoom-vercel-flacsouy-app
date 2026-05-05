import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

const patchBodySchema = z.object({
  motivo: z.string().trim().max(240).optional().or(z.literal("")),
  requiereAsistencia: z.boolean().optional()
});

export async function GET(_request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canRead =
    user.role === UserRole.DOCENTE ||
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.CONTADURIA;
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { solicitudId } = await context.params;
    const service = new SalasService();
    const request = await service.getSolicitud(user, solicitudId);
    return NextResponse.json({ request });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo cargar la solicitud." },
      { status: 404 }
    );
  }
}

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

  const canEditAssistance =
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.DOCENTE;
  if (!canEditAssistance) {
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
    const result = await service.updateSolicitudAssistance(user, solicitudId, {
      motivo: typeof parsed.data.motivo === "string" ? parsed.data.motivo : undefined,
      requiereAsistencia: parsed.data.requiereAsistencia
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo actualizar la solicitud." },
      { status: 400 }
    );
  }
}
