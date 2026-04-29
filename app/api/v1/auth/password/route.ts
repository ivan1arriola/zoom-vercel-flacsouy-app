import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const { password } = await request.json();

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.user.update({
      where: { id: sessionUser.id },
      data: { passwordHash }
    });

    return NextResponse.json({ success: true, message: "Contraseña actualizada correctamente." });
  } catch (error) {
    console.error("Error updating password:", error);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
