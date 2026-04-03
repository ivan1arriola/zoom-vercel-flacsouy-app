import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const monthKey = (url.searchParams.get("month") ?? "").trim() || undefined;
    const service = new SalasService();
    const report = await service.buildMonthlyAccountingWorkbook({ monthKey });

    return new NextResponse(new Uint8Array(report.content), {
      status: 200,
      headers: {
        "Content-Type": report.contentType,
        "Content-Disposition": `attachment; filename="${report.fileName}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo generar el informe mensual." },
      { status: 400 }
    );
  }
}
