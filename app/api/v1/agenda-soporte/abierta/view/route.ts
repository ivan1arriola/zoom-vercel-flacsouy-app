import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess =
    user.role === UserRole.ASISTENTE_ZOOM ||
    user.role === UserRole.ADMINISTRADOR;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Record that the assistant viewed the agenda using Auditoria
    await db.auditoria.create({
      data: {
        actorUsuarioId: user.id,
        accion: "VIEW_AGENDA_DISPONIBLE",
        entidadTipo: "AgendaLibre",
        entidadId: user.id, // Using user id as reference to who viewed it
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo registrar la vista." },
      { status: 500 }
    );
  }
}
