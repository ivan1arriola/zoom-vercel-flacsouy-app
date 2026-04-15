import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

const enableInstanceAssistanceSchema = z
  .object({
    eventoId: z.string().trim().optional(),
    inicioProgramadoAt: z.string().trim().optional(),
    motivo: z.string().trim().max(240).optional().or(z.literal("")),
    requiereAsistencia: z.boolean().optional()
  })
  .refine(
    (value) => Boolean(value.eventoId) || Boolean(value.inicioProgramadoAt),
    "Debes indicar eventoId o inicioProgramadoAt."
  );

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canEditAssistance =
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.DOCENTE;
  if (!canEditAssistance) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = enableInstanceAssistanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos." },
      { status: 400 }
    );
  }

  try {
    const { solicitudId } = await context.params;
    const service = new SalasService();
    const result = await service.updateSolicitudInstanceAssistance(user, solicitudId, {
      eventoId: parsed.data.eventoId,
      inicioProgramadoAt: parsed.data.inicioProgramadoAt,
      motivo: typeof parsed.data.motivo === "string" ? parsed.data.motivo : undefined,
      requiereAsistencia: parsed.data.requiereAsistencia ?? true
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar asistencia Zoom para la instancia."
      },
      { status: 400 }
    );
  }
}
