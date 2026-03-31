import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ eventoId: string }> };

const bodySchema = z.object({
  programaNombre: z.string().trim().max(120).optional().or(z.literal("")),
  monitorEmail: z.string().trim().email("Email asistente invalido.").optional().or(z.literal(""))
});

export async function PATCH(request: Request, context: Params) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { eventoId } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos." },
      { status: 400 }
    );
  }

  try {
    const service = new SalasService();
    await service.updatePastMeeting(user, eventoId, {
      programaNombre:
        typeof parsed.data.programaNombre === "string"
          ? parsed.data.programaNombre
          : undefined,
      monitorEmail:
        typeof parsed.data.monitorEmail === "string" ? parsed.data.monitorEmail : undefined
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar la reunion." },
      { status: 400 }
    );
  }
}
