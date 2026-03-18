import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

const updateProfileSchema = z.object({
  firstName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  image: z.string().trim().url("La foto debe ser una URL válida.").optional().or(z.literal(""))
});

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      image: true
    }
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    user,
    profileComplete: Boolean(user.firstName && user.lastName && user.email)
  });
}

export async function PUT(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateProfileSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const firstName = parsed.data.firstName && parsed.data.firstName.length > 0 ? parsed.data.firstName : null;
  const lastName = parsed.data.lastName && parsed.data.lastName.length > 0 ? parsed.data.lastName : null;
  const image = parsed.data.image && parsed.data.image.length > 0 ? parsed.data.image : null;
  const name = firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || lastName || null;

  try {
    const updated = await db.user.update({
      where: { id: sessionUser.id },
      data: {
        firstName,
        lastName,
        name,
        image
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        name: true,
        image: true
      }
    });

    return NextResponse.json({
      ok: true,
      user: updated
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "No se pudo actualizar el perfil." }, { status: 500 });
  }
}
