import {
  EstadoEnvioNotificacion,
  Prisma,
  TipoNotificacion,
  UserRole
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

const createNotificacionSchema = z.object({
  asunto: z.string().trim().min(1, "El asunto es obligatorio.").max(180),
  cuerpo: z.string().trim().min(1, "El cuerpo es obligatorio.").max(5000),
  tipoNotificacion: z.nativeEnum(TipoNotificacion).default(TipoNotificacion.IN_APP),
  destinatarios: z
    .enum(["USUARIOS_ESPECIFICOS", "TODOS", "ADMINS"])
    .default("USUARIOS_ESPECIFICOS"),
  usuarioId: z.string().trim().min(1).optional(),
  usuarioIds: z.array(z.string().trim().min(1)).optional(),
  entidadReferenciaTipo: z.string().trim().max(80).optional().or(z.literal("")),
  entidadReferenciaId: z.string().trim().max(120).optional().or(z.literal(""))
});

const patchNotificacionesSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "Debes indicar al menos una notificacion."),
  leida: z.boolean().default(true),
  scope: z.enum(["mine", "all"]).optional()
});

const deleteNotificacionesSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1, "Debes indicar al menos una notificacion."),
  scope: z.enum(["mine", "all"]).optional()
});

function normalizeNullable(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function parseScope(rawScope: string | null, isAdmin: boolean): "mine" | "all" {
  if (!isAdmin) return "mine";
  return rawScope === "all" ? "all" : "mine";
}

function parseEstado(rawValue: string | null): EstadoEnvioNotificacion | null {
  if (!rawValue) return null;
  return Object.values(EstadoEnvioNotificacion).includes(rawValue as EstadoEnvioNotificacion)
    ? (rawValue as EstadoEnvioNotificacion)
    : null;
}

function parseTipo(rawValue: string | null): TipoNotificacion | null {
  if (!rawValue) return null;
  return Object.values(TipoNotificacion).includes(rawValue as TipoNotificacion)
    ? (rawValue as TipoNotificacion)
    : null;
}

function parseLectura(rawValue: string | null): "TODAS" | "LEIDAS" | "NO_LEIDAS" {
  if (rawValue === "LEIDAS") return "LEIDAS";
  if (rawValue === "NO_LEIDAS") return "NO_LEIDAS";
  return "TODAS";
}

function parseOrden(rawValue: string | null): Prisma.SortOrder {
  if (rawValue === "asc") return "asc";
  return "desc";
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = user.role === UserRole.ADMINISTRADOR;

  try {
    const { searchParams } = new URL(request.url);
    const page = clampNumber(parseInt(searchParams.get("page") ?? "1", 10), 1, 10000);
    const limit = clampNumber(parseInt(searchParams.get("limit") ?? "30", 10), 1, 100);
    const estado = parseEstado(searchParams.get("estado"));
    const tipo = parseTipo(searchParams.get("tipo"));
    const lectura = parseLectura(searchParams.get("lectura"));
    const orden = parseOrden(searchParams.get("orden"));
    const scope = parseScope(searchParams.get("scope"), isAdmin);

    const where: Prisma.NotificacionWhereInput = {};
    if (scope === "mine") where.usuarioId = user.id;
    if (estado) where.estadoEnvio = estado;
    if (tipo) where.tipoNotificacion = tipo;
    if (lectura === "LEIDAS") where.leidaAt = { not: null };
    if (lectura === "NO_LEIDAS") where.leidaAt = null;

    const skip = (page - 1) * limit;

    const [notificaciones, total, unreadCount] = await Promise.all([
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
        orderBy: { createdAt: orden },
        skip,
        take: limit
      }),
      db.notificacion.count({ where }),
      db.notificacion.count({
        where: {
          ...where,
          leidaAt: null
        }
      })
    ]);

    return NextResponse.json({
      scope,
      orden,
      notificaciones,
      unreadCount,
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

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Solo administradores pueden crear notificaciones." }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = createNotificacionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
  }

  const data = parsed.data;
  const explicitIds = Array.from(
    new Set([data.usuarioId, ...(data.usuarioIds ?? [])].filter(Boolean) as string[])
  );

  let destinatarios: Array<{ id: string }> = [];
  if (data.destinatarios === "TODOS") {
    destinatarios = await db.user.findMany({
      select: { id: true }
    });
  } else if (data.destinatarios === "ADMINS") {
    destinatarios = await db.user.findMany({
      where: { role: UserRole.ADMINISTRADOR },
      select: { id: true }
    });
  } else {
    if (explicitIds.length === 0) {
      return NextResponse.json({ error: "Debes indicar al menos un destinatario." }, { status: 400 });
    }
    destinatarios = await db.user.findMany({
      where: { id: { in: explicitIds } },
      select: { id: true }
    });
  }

  if (destinatarios.length === 0) {
    return NextResponse.json({ error: "No se encontraron destinatarios validos." }, { status: 400 });
  }

  const now = new Date();
  const created = await db.notificacion.createMany({
    data: destinatarios.map((target) => ({
      usuarioId: target.id,
      tipoNotificacion: data.tipoNotificacion,
      canalDestino: "IN_APP",
      asunto: data.asunto,
      cuerpo: data.cuerpo,
      estadoEnvio: EstadoEnvioNotificacion.ENVIADA,
      intentoCount: 1,
      ultimoIntentoAt: now,
      entidadReferenciaTipo: normalizeNullable(data.entidadReferenciaTipo ?? undefined),
      entidadReferenciaId: normalizeNullable(data.entidadReferenciaId ?? undefined)
    }))
  });

  // Intentar enviar notificaciones Push si el tipo es IN_APP o ALERTA_OPERATIVA
  if (data.tipoNotificacion !== TipoNotificacion.EMAIL) {
    const pushSubscribers = await db.pushSubscription.findMany({
      where: { userId: { in: destinatarios.map(d => d.id) } }
    });

    const { sendPushNotification } = await import("@/src/lib/push");

    // Enviamos de forma asincrona sin bloquear la respuesta de la API
    void Promise.all(pushSubscribers.map(sub => 
      sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        {
          title: data.asunto,
          body: data.cuerpo,
          url: "/notificaciones", // Opcional: podriamos derivar una URL mas especifica
          tag: "flacso-push"
        }
      ).then(res => {
        if (res.success === false && res.expired) {
          // Limpiar suscripciones expiradas
          void db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      })
    )).catch(err => console.error("Error en envio masivo push:", err));
  }

  return NextResponse.json(
    {
      ok: true,
      createdCount: created.count
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const parsed = patchNotificacionesSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
  }

  const scope = parseScope(parsed.data.scope ?? null, user.role === UserRole.ADMINISTRADOR);
  const where: Prisma.NotificacionWhereInput = {
    id: { in: parsed.data.ids }
  };
  if (scope === "mine") {
    where.usuarioId = user.id;
  }

  const updated = await db.notificacion.updateMany({
    where,
    data: {
      leidaAt: parsed.data.leida ? new Date() : null
    }
  });

  return NextResponse.json({
    ok: true,
    updatedCount: updated.count
  });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const parsed = deleteNotificacionesSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos invalidos." }, { status: 400 });
  }

  const scope = parseScope(parsed.data.scope ?? null, user.role === UserRole.ADMINISTRADOR);
  const where: Prisma.NotificacionWhereInput = {
    id: { in: parsed.data.ids }
  };
  if (scope === "mine") {
    where.usuarioId = user.id;
  }

  const deleted = await db.notificacion.deleteMany({ where });
  return NextResponse.json({
    ok: true,
    deletedCount: deleted.count
  });
}
