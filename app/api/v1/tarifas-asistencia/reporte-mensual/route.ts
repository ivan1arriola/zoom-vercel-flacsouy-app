import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

async function ensureAccountingAccess() {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const canAccess = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;
  if (!canAccess) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const access = await ensureAccountingAccess();
  if (!access.ok) return access.response;

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

export async function POST(request: Request) {
  const access = await ensureAccountingAccess();
  if (!access.ok) return access.response;

  try {
    const rawBody = (await request.json().catch(() => ({}))) as {
      month?: unknown;
      driveFolderId?: unknown;
    };
    const monthKey = typeof rawBody.month === "string" ? rawBody.month.trim() : undefined;
    const driveFolderId = typeof rawBody.driveFolderId === "string"
      ? rawBody.driveFolderId.trim()
      : undefined;

    const service = new SalasService();
    const uploaded = await service.uploadMonthlyAccountingWorkbookToDrive({
      monthKey,
      driveFolderId
    });

    return NextResponse.json({
      ok: true,
      ...uploaded
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo subir el informe mensual a Drive." },
      { status: 400 }
    );
  }
}
