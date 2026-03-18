import { NextResponse } from "next/server";
import { getSessionUser, isAdminAuthorized } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

type Params = { params: Promise<{ solicitudId: string }> };

export async function POST(request: Request, context: Params) {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { solicitudId } = await context.params;
    const body = (await request.json()) as {
      cuentaZoomAsignadaId: string;
      accionTomada: string;
      motivoSistema: string;
      zoomMeetingIdManual: string;
      zoomJoinUrlManual?: string;
      observaciones?: string;
    };

    const service = new SalasService();
    const requestUpdated = await service.resolveManualProvision(user, solicitudId, body);
    return NextResponse.json({ request: requestUpdated });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo resolver manualmente." },
      { status: 400 }
    );
  }
}
