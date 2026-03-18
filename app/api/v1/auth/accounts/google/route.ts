import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

// DELETE: Desvincular cuenta de Google
export async function DELETE() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Verificar que el usuario tiene contraseña (para poder desvincular Google)
    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordHash: true }
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "No puedes desvincular Google si no tienes contraseña establecida." },
        { status: 400 }
      );
    }

    // Eliminar la cuenta de Google vinculada
    await db.account.deleteMany({
      where: {
        userId: sessionUser.id,
        provider: "google"
      }
    });

    return NextResponse.json({
      ok: true,
      message: "Cuenta de Google desvinculada exitosamente"
    });
  } catch (error) {
    console.error("Error unlinking Google account:", error);
    return NextResponse.json(
      { error: "No se pudo desvincular la cuenta de Google" },
      { status: 500 }
    );
  }
}

// GET: Obtener cuentas vinculadas
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await db.account.findMany({
      where: { userId: sessionUser.id },
      select: {
        provider: true,
        providerAccountId: true
      }
    });

    const user = await db.user.findUnique({
      where: { id: sessionUser.id },
      select: { passwordHash: true }
    });

    return NextResponse.json({
      accounts,
      hasPassword: Boolean(user?.passwordHash)
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { error: "No se pudo obtener las cuentas vinculadas" },
      { status: 500 }
    );
  }
}
