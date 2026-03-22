export type Tarifa = {
  id: string;
  modalidadReunion: string;
  valorHora: string;
  moneda: string;
  estado?: string;
  vigenteDesde?: string;
};

export async function loadTarifas(): Promise<Tarifa[] | null> {
  const res = await fetch("/api/v1/tarifas-asistencia", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    rates: Array<{
      id: string;
      modalidadReunion: string;
      valorHora: string;
      moneda: string;
      estado?: string;
      vigenteDesde?: string;
    }>;
  };
  return json.rates;
}

export async function submitTarifaUpdate(payload: Record<string, unknown>): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/tarifas-asistencia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo actualizar la tarifa."
    };
  }
  return { success: true };
}
