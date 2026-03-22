import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmPasswordRecovery } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8),
  mode: z.enum(["recovery", "activation"]).optional()
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos." }, { status: 400 });
  }

  try {
    const origin = request.headers.get("origin") ?? undefined;
    const mode = parsed.data.mode ?? "recovery";
    await confirmPasswordRecovery(parsed.data.email, parsed.data.token, parsed.data.password, mode, origin);

    return NextResponse.json({
      ok: true,
      message:
        mode === "activation"
          ? "Cuenta activada correctamente. Te enviamos un correo de confirmacion."
          : "Contrasena actualizada correctamente."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la contrasena.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
