import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = new SalasService();
  const pendings = await service.listManualProvisionPendings();
  return NextResponse.json({ pendings });
}
