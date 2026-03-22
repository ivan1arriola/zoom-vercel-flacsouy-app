import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
const GOOGLE_ALLOWED_DOMAIN = "@flacso.edu.uy";

type GoogleUserInfo = {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
};

function canUseGoogle(email: string): boolean {
  return email.trim().toLowerCase().endsWith(GOOGLE_ALLOWED_DOMAIN);
}

// POST: Volver a sincronizar datos de perfil con Google
export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canUseGoogle(sessionUser.email)) {
    return NextResponse.json(
      { error: "Google solo esta habilitado para cuentas @flacso.edu.uy." },
      { status: 403 }
    );
  }

  try {
    const googleAccount = await db.account.findFirst({
      where: {
        userId: sessionUser.id,
        provider: "google"
      },
      select: {
        access_token: true
      }
    });

    if (!googleAccount) {
      return NextResponse.json(
        { error: "No hay una cuenta de Google vinculada para sincronizar." },
        { status: 400 }
      );
    }

    if (!googleAccount.access_token) {
      return NextResponse.json(
        { error: "No hay token de acceso de Google disponible. Vuelve a vincular la cuenta." },
        { status: 400 }
      );
    }

    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${googleAccount.access_token}`
      },
      cache: "no-store"
    });

    if (!profileResponse.ok) {
      return NextResponse.json(
        { error: "No se pudo leer el perfil desde Google. Vuelve a vincular la cuenta." },
        { status: 400 }
      );
    }

    const googleUser = (await profileResponse.json()) as GoogleUserInfo;
    const googleEmail = googleUser.email?.trim().toLowerCase();
    if (!googleEmail || googleEmail !== sessionUser.email.trim().toLowerCase()) {
      return NextResponse.json(
        { error: "La cuenta de Google vinculada no coincide con el usuario actual." },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id: sessionUser.id },
      data: {
        firstName: googleUser.given_name ?? undefined,
        lastName: googleUser.family_name ?? undefined,
        name: googleUser.name ?? undefined,
        image: googleUser.picture ?? undefined,
        emailVerified: googleUser.email_verified ? new Date() : undefined
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        image: true
      }
    });

    return NextResponse.json({
      ok: true,
      message: "Perfil sincronizado desde Google.",
      user: updated
    });
  } catch (error) {
    console.error("Error syncing Google profile:", error);
    return NextResponse.json(
      { error: "No se pudo sincronizar el perfil desde Google." },
      { status: 500 }
    );
  }
}

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
      hasPassword: Boolean(user?.passwordHash),
      canUseGoogle: canUseGoogle(sessionUser.email)
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { error: "No se pudo obtener las cuentas vinculadas" },
      { status: 500 }
    );
  }
}
