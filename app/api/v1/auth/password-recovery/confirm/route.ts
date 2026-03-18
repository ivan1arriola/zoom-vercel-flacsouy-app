import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmPasswordRecovery } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    await confirmPasswordRecovery(parsed.data.email, parsed.data.token, parsed.data.password);
    return NextResponse.json({ ok: true, message: "Contraseña actualizada correctamente." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la contraseña.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
