import { NextResponse } from "next/server";
import { getSessionUser, isAdminAuthorized } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json()) as {
      titulo?: string;
      responsableNombre?: string;
      programaNombre?: string;
      modalidadReunion?: "VIRTUAL" | "HIBRIDA";
      inicioProgramadoAt?: string;
      finProgramadoAt?: string;
      timezone?: string;
      zoomMeetingId?: string;
      zoomJoinUrl?: string;
      zoomAccountId?: string;
      zoomAccountEmail?: string;
      requiereAsistencia?: boolean;
      descripcion?: string;
    };

    const service = new SalasService();
    const result = await service.registerUpcomingMeetingInSystem(user, {
      titulo: body.titulo ?? "",
      responsableNombre: body.responsableNombre ?? "",
      programaNombre: body.programaNombre ?? "",
      modalidadReunion: body.modalidadReunion === "HIBRIDA" ? "HIBRIDA" : "VIRTUAL",
      inicioProgramadoAt: body.inicioProgramadoAt ?? "",
      finProgramadoAt: body.finProgramadoAt ?? "",
      timezone: body.timezone,
      zoomMeetingId: body.zoomMeetingId,
      zoomJoinUrl: body.zoomJoinUrl,
      zoomAccountId: body.zoomAccountId,
      zoomAccountEmail: body.zoomAccountEmail,
      requiereAsistencia: body.requiereAsistencia ?? false,
      descripcion: body.descripcion
    });

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la reunion en el sistema."
      },
      { status: 400 }
    );
  }
}
