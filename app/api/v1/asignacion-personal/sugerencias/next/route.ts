import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== UserRole.ADMINISTRADOR) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = body?.sessionId?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId es obligatorio." }, { status: 400 });
    }

    const service = new SalasService();
    const result = await service.getNextMonthlyAssignmentSuggestion(user, sessionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo calcular la siguiente sugerencia." },
      { status: 400 }
    );
  }
}
