import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

function canAccess(role: UserRole): boolean {
  return (
    role === UserRole.ADMINISTRADOR ||
    role === UserRole.CONTADURIA ||
    role === UserRole.ASISTENTE_ZOOM
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const hostAccount =
    body && typeof body === "object" && "hostAccount" in body && typeof body.hostAccount === "string"
      ? body.hostAccount.trim()
      : "";
  if (!hostAccount) {
    return NextResponse.json({ error: "Debes indicar hostAccount." }, { status: 400 });
  }

  try {
    const service = new SalasService();
    if (user.role === UserRole.ASISTENTE_ZOOM) {
      const ownHours = await service.listPersonMeetingHours({ userId: user.id });
      const allowedHostAccounts = new Set(
        ownHours.meetings
          .map((meeting) =>
            (
              meeting.zoomHostAccount ??
              meeting.zoomAccountEmail ??
              meeting.zoomAccountName ??
              ""
            )
              .trim()
              .toLowerCase()
          )
          .filter((item) => item.length > 0)
      );

      if (!allowedHostAccounts.has(hostAccount.toLowerCase())) {
        return NextResponse.json(
          {
            error: "No tienes permisos para ver la contrasena de esta cuenta Zoom."
          },
          { status: 403 }
        );
      }
    }

    const payload = await service.getZoomAccountPassword({ hostAccount });
    if (!payload.password) {
      return NextResponse.json(
        {
          success: false,
          hostAccount: payload.hostAccount,
          error: "No hay contrasena disponible para esta cuenta."
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      hostAccount: payload.hostAccount,
      password: payload.password
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo obtener la contrasena de la cuenta Zoom."
      },
      { status: 500 }
    );
  }
}
