import { NextResponse } from "next/server";
import {
  EstadoAsignacion,
  EstadoEnvioNotificacion,
  EstadoInteresAsistente,
  TipoAsignacionAsistente,
  TipoNotificacion,
  UserRole
} from "@prisma/client";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

function getUserDisplayName(user: {
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if (user.name?.trim()) return user.name.trim();
  return user.email;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Solo administradores pueden acceder a este recurso" }, { status: 403 });
  }

  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const assistants = await db.asistenteZoom.findMany({
      select: {
        id: true,
        usuarioId: true,
        usuario: {
          select: {
            email: true,
            name: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const assistantIds = assistants.map((item) => item.id);
    const assistantUserIds = assistants.map((item) => item.usuarioId);

    const [
      postuladasTotal,
      asignadasTotal,
      postuladasMes,
      asignadasMes,
      notifTotals,
      notifEstado,
      notifTipo,
      notifLast7d,
      notifByAssistant,
      notifSentByAssistant,
      notifFailedByAssistant,
      notifPendingByAssistant
    ] = await Promise.all([
      db.interesAsistenteEvento.groupBy({
        by: ["asistenteZoomId"],
        where: {
          asistenteZoomId: { in: assistantIds },
          estadoInteres: EstadoInteresAsistente.ME_INTERESA
        },
        _count: { _all: true }
      }),
      db.asignacionAsistente.groupBy({
        by: ["asistenteZoomId"],
        where: {
          asistenteZoomId: { in: assistantIds },
          tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
          estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] }
        },
        _count: { _all: true }
      }),
      db.interesAsistenteEvento.groupBy({
        by: ["asistenteZoomId"],
        where: {
          asistenteZoomId: { in: assistantIds },
          estadoInteres: EstadoInteresAsistente.ME_INTERESA,
          evento: {
            inicioProgramadoAt: {
              gte: monthStart,
              lt: nextMonthStart
            }
          }
        },
        _count: { _all: true }
      }),
      db.asignacionAsistente.groupBy({
        by: ["asistenteZoomId"],
        where: {
          asistenteZoomId: { in: assistantIds },
          tipoAsignacion: TipoAsignacionAsistente.PRINCIPAL,
          estadoAsignacion: { in: [EstadoAsignacion.ASIGNADO, EstadoAsignacion.ACEPTADO] },
          evento: {
            inicioProgramadoAt: {
              gte: monthStart,
              lt: nextMonthStart
            }
          }
        },
        _count: { _all: true }
      }),
      db.notificacion.count(),
      db.notificacion.groupBy({ by: ["estadoEnvio"], _count: { _all: true } }),
      db.notificacion.groupBy({ by: ["tipoNotificacion"], _count: { _all: true } }),
      db.notificacion.count({
        where: {
          createdAt: { gte: last7Days }
        }
      }),
      db.notificacion.groupBy({
        by: ["usuarioId"],
        where: {
          usuarioId: { in: assistantUserIds }
        },
        _count: { _all: true }
      }),
      db.notificacion.groupBy({
        by: ["usuarioId"],
        where: {
          usuarioId: { in: assistantUserIds },
          estadoEnvio: EstadoEnvioNotificacion.ENVIADA
        },
        _count: { _all: true }
      }),
      db.notificacion.groupBy({
        by: ["usuarioId"],
        where: {
          usuarioId: { in: assistantUserIds },
          estadoEnvio: EstadoEnvioNotificacion.FALLIDA
        },
        _count: { _all: true }
      }),
      db.notificacion.groupBy({
        by: ["usuarioId"],
        where: {
          usuarioId: { in: assistantUserIds },
          estadoEnvio: EstadoEnvioNotificacion.PENDIENTE
        },
        _count: { _all: true }
      })
    ]);

    const postuladasTotalByAssistant = new Map(postuladasTotal.map((row) => [row.asistenteZoomId, row._count._all]));
    const asignadasTotalByAssistant = new Map(asignadasTotal.map((row) => [row.asistenteZoomId, row._count._all]));
    const postuladasMesByAssistant = new Map(postuladasMes.map((row) => [row.asistenteZoomId, row._count._all]));
    const asignadasMesByAssistant = new Map(asignadasMes.map((row) => [row.asistenteZoomId, row._count._all]));

    const notifTotalByUser = new Map(notifByAssistant.map((row) => [row.usuarioId, row._count._all]));
    const notifSentByUser = new Map(notifSentByAssistant.map((row) => [row.usuarioId, row._count._all]));
    const notifFailedByUser = new Map(notifFailedByAssistant.map((row) => [row.usuarioId, row._count._all]));
    const notifPendingByUser = new Map(notifPendingByAssistant.map((row) => [row.usuarioId, row._count._all]));

    const assistantStats = assistants.map((assistant) => {
      const postuladas = postuladasTotalByAssistant.get(assistant.id) ?? 0;
      const asignadas = asignadasTotalByAssistant.get(assistant.id) ?? 0;
      const postuladasMesActual = postuladasMesByAssistant.get(assistant.id) ?? 0;
      const asignadasMesActual = asignadasMesByAssistant.get(assistant.id) ?? 0;
      const ratio = postuladas > 0 ? Number(((asignadas / postuladas) * 100).toFixed(1)) : 0;
      const ratioMesActual =
        postuladasMesActual > 0
          ? Number(((asignadasMesActual / postuladasMesActual) * 100).toFixed(1))
          : 0;

      return {
        asistenteZoomId: assistant.id,
        usuarioId: assistant.usuarioId,
        nombre: getUserDisplayName({
          email: assistant.usuario.email,
          name: assistant.usuario.name,
          firstName: assistant.usuario.firstName,
          lastName: assistant.usuario.lastName
        }),
        email: assistant.usuario.email,
        role: assistant.usuario.role,
        postuladas,
        asignadas,
        ratio,
        postuladasMesActual,
        asignadasMesActual,
        ratioMesActual,
        notificaciones: {
          total: notifTotalByUser.get(assistant.usuarioId) ?? 0,
          enviadas: notifSentByUser.get(assistant.usuarioId) ?? 0,
          fallidas: notifFailedByUser.get(assistant.usuarioId) ?? 0,
          pendientes: notifPendingByUser.get(assistant.usuarioId) ?? 0
        }
      };
    });

    const estadoMap: Record<EstadoEnvioNotificacion, number> = {
      PENDIENTE: 0,
      ENVIADA: 0,
      FALLIDA: 0
    };
    for (const row of notifEstado) {
      estadoMap[row.estadoEnvio] = row._count._all;
    }

    const tipoMap: Record<TipoNotificacion, number> = {
      EMAIL: 0,
      IN_APP: 0,
      ALERTA_OPERATIVA: 0
    };
    for (const row of notifTipo) {
      tipoMap[row.tipoNotificacion] = row._count._all;
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      assistants: assistantStats,
      notifications: {
        total: notifTotals,
        last7Days: notifLast7d,
        byEstado: estadoMap,
        byTipo: tipoMap
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo obtener estadisticas"
      },
      { status: 400 }
    );
  }
}
