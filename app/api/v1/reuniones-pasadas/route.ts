import { ModalidadReunion, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

const bodySchema = z.object({
  docenteEmail: z.string().trim().email("Email docente invalido."),
  monitorEmail: z.string().trim().email("Email monitoreo invalido.").optional().or(z.literal("")),
  zoomMeetingId: z.string().trim().optional().or(z.literal("")),
  titulo: z.string().trim().min(3).max(180),
  modalidadReunion: z.nativeEnum(ModalidadReunion),
  inicioRealAt: z.string().trim().min(1),
  finRealAt: z.string().trim().min(1),
  timezone: z.string().trim().min(1).optional().or(z.literal("")),
  programaNombre: z.string().trim().max(120).optional().or(z.literal("")),
  responsableNombre: z.string().trim().max(120).optional().or(z.literal("")),
  descripcion: z.string().trim().max(2000).optional().or(z.literal("")),
  zoomJoinUrl: z.string().trim().url("zoomJoinUrl invalida.").optional().or(z.literal(""))
}).refine(
  (value) => Boolean((value.zoomMeetingId ?? "").trim() || (value.zoomJoinUrl ?? "").trim()),
  { message: "Debes indicar Zoom Meeting ID o link de Zoom." }
);

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = new SalasService();
  const meetings = await service.listPastMeetings(user);
  return NextResponse.json({ meetings });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
  }

  const service = new SalasService();
  try {
    const result = await service.registerPastMeeting(user, {
      docenteEmail: parsed.data.docenteEmail,
      monitorEmail: parsed.data.monitorEmail || undefined,
      zoomMeetingId: parsed.data.zoomMeetingId || undefined,
      titulo: parsed.data.titulo,
      modalidadReunion: parsed.data.modalidadReunion,
      inicioRealAt: parsed.data.inicioRealAt,
      finRealAt: parsed.data.finRealAt,
      timezone: parsed.data.timezone || undefined,
      programaNombre: parsed.data.programaNombre || undefined,
      responsableNombre: parsed.data.responsableNombre || undefined,
      descripcion: parsed.data.descripcion || undefined,
      zoomJoinUrl: parsed.data.zoomJoinUrl || undefined
    });

    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo registrar la reunion pasada." },
      { status: 400 }
    );
  }
}
