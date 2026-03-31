import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

const createInstanceSchema = z.object({
  inicioProgramadoAt: z.string().trim().min(1, "inicioProgramadoAt es requerido."),
  finProgramadoAt: z.string().trim().min(1, "finProgramadoAt es requerido.")
});

export async function POST(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createInstanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos." },
      { status: 400 }
    );
  }

  try {
    const { solicitudId } = await context.params;
    const service = new SalasService();
    const result = await service.addSolicitudInstance(user, solicitudId, {
      inicioProgramadoAt: parsed.data.inicioProgramadoAt,
      finProgramadoAt: parsed.data.finProgramadoAt
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo agregar la instancia." },
      { status: 400 }
    );
  }
}

