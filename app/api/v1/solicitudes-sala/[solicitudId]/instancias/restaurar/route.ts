import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

const restoreInstanceSchema = z
  .object({
    eventoId: z.string().trim().optional(),
    inicioProgramadoAt: z.string().trim().optional(),
    motivo: z.string().trim().optional()
  })
  .refine(
    (value) => Boolean(value.eventoId) || Boolean(value.inicioProgramadoAt),
    "Debes indicar eventoId o inicioProgramadoAt."
  );

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = restoreInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos." },
      { status: 400 }
    );
  }

  try {
    const { solicitudId } = await context.params;
    const service = new SalasService();
    const result = await service.restoreSolicitudInstance(user, solicitudId, {
      eventoId: parsed.data.eventoId,
      inicioProgramadoAt: parsed.data.inicioProgramadoAt,
      motivo: parsed.data.motivo
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo descancelar la instancia." },
      { status: 400 }
    );
  }
}
