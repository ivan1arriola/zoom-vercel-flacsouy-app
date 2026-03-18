import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyFlacsoRegistration } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1)
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    await verifyFlacsoRegistration(parsed.data.email, parsed.data.token);
    return NextResponse.json({ ok: true, message: "Cuenta verificada correctamente." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo verificar el registro.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
