export type Programa = {
  id: string;
  nombre: string;
};

export async function loadProgramas(): Promise<Programa[] | null> {
  const res = await fetch("/api/v1/programas", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { programas: Programa[] };
  return json.programas;
}

export async function createPrograma(nombre: string): Promise<{
  success: boolean;
  programa?: Programa;
  error?: string;
}> {
  const res = await fetch("/api/v1/programas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre })
  });

  const json = (await res.json()) as { error?: string; programa?: Programa };

  if (!res.ok) {
    return {
      success: false,
      error: json.error ?? "No se pudo crear el programa."
    };
  }

  return {
    success: true,
    programa: json.programa
  };
}
