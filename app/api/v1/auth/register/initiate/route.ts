import { NextResponse } from "next/server";
import { z } from "zod";
import { requestFlacsoRegistration } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional()
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos." }, { status: 400 });
  }

  try {
    const origin = request.headers.get("origin") ?? undefined;
    const result = await requestFlacsoRegistration({
      email: parsed.data.email,
      password: parsed.data.password,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      origin
    });

    return NextResponse.json({
      ok: true,
      message: "Te enviamos un correo de verificacion.",
      verificationUrl: result.verificationUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar el registro.";
    const normalizedMessage = message.toLowerCase();
    const status =
      normalizedMessage.includes("ya esta registrado") ||
      normalizedMessage.includes("ya está registrado")
        ? 409
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
