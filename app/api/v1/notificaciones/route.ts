import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";
import { UserRole } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Solo administradores pueden ver todas las notificaciones
  const isAdmin = user.role === UserRole.ADMINISTRADOR;
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Solo administradores pueden acceder a este recurso" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const estado = searchParams.get("estado"); // PENDIENTE, ENVIADO, FALLIDO
    const tipo = searchParams.get("tipo"); // NOTIFICACION_TIPO

    const where: Record<string, unknown> = {};
    if (estado) where.estadoEnvio = estado;
    if (tipo) where.tipoNotificacion = tipo;

    const skip = (page - 1) * limit;

    const [notificaciones, total] = await Promise.all([
      db.notificacion.findMany({
        where,
        include: {
          usuario: {
            select: {
              id: true,
              email: true,
              name: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      db.notificacion.count({ where })
    ]);

    return NextResponse.json({
      notificaciones,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener las notificaciones."
      },
      { status: 400 }
    );
  }
}
