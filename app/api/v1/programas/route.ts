import { Prisma, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const programas = await db.$queryRaw<Array<{ id: string; nombre: string }>>(Prisma.sql`
    SELECT id, nombre
    FROM "Programa"
    ORDER BY nombre ASC
  `);

  return NextResponse.json({ programas });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canCreate =
    user.role === UserRole.DOCENTE ||
    user.role === UserRole.ADMINISTRADOR ||
    user.role === UserRole.ASISTENTE_ZOOM ||
    user.role === UserRole.SOPORTE_ZOOM;

  if (!canCreate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { nombre?: unknown };
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";

    if (!nombre) {
      return NextResponse.json({ error: "El nombre del programa es obligatorio." }, { status: 400 });
    }

    const existingRows = await db.$queryRaw<Array<{ id: string; nombre: string }>>(Prisma.sql`
      SELECT id, nombre
      FROM "Programa"
      WHERE LOWER(nombre) = LOWER(${nombre})
      LIMIT 1
    `);
    const existing = existingRows[0] ?? null;

    if (existing) {
      return NextResponse.json({ programa: existing }, { status: 200 });
    }

    const programaId = randomUUID();
    const createdRows = await db.$queryRaw<Array<{ id: string; nombre: string }>>(Prisma.sql`
      INSERT INTO "Programa" (id, nombre)
      VALUES (${programaId}, ${nombre})
      RETURNING id, nombre
    `);
    const programa = createdRows[0];
    if (!programa) {
      throw new Error("No se pudo crear el programa.");
    }

    return NextResponse.json({ programa }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo crear el programa." },
      { status: 400 }
    );
  }
}
