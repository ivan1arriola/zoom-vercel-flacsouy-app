import { ModalidadReunion, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/api-auth";
import { SalasService } from "@/src/modules/salas/service";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = new SalasService();
  const rates = await service.listTarifas();
  return NextResponse.json({ rates });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canAccess = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      modalidadReunion: ModalidadReunion;
      valorHora: number;
      moneda: string;
      vigenteDesde?: string;
      motivoCambio?: string;
    };

    if (!Object.values(ModalidadReunion).includes(body.modalidadReunion)) {
      return NextResponse.json({ error: "modalidadReunion inválida." }, { status: 400 });
    }

    const service = new SalasService();
    const rate = await service.createTarifa(user, body);
    return NextResponse.json({ rate }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "No se pudo guardar la tarifa." },
      { status: 400 }
    );
  }
}
