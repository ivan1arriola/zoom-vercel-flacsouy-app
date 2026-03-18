import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordRecovery } from "@/src/modules/auth/registration.service";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email()
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    const origin = request.headers.get("origin") ?? undefined;
    const result = await requestPasswordRecovery(parsed.data.email, origin);

    return NextResponse.json({
      ok: true,
      message: "Si el correo existe, enviamos instrucciones de recuperación.",
      resetUrl: result.resetUrl
    });
  } catch {
    return NextResponse.json({
      ok: true,
      message: "Si el correo existe, enviamos instrucciones de recuperación."
    });
  }
}
