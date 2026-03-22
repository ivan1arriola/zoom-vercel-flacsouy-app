import { useEffect, useMemo, useState } from "react";
import type { Tarifa } from "@/src/services/tarifasApi";

export type TarifaModalidad = "HIBRIDA" | "VIRTUAL";

export interface TarifaConfigForm {
  valorHora: string;
  moneda: string;
}

export function useTarifas() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [isSubmittingTarifa, setIsSubmittingTarifa] = useState(false);
  const [tarifaFormByModalidad, setTarifaFormByModalidad] = useState<Record<TarifaModalidad, TarifaConfigForm>>({
    HIBRIDA: { valorHora: "", moneda: "UYU" },
    VIRTUAL: { valorHora: "", moneda: "UYU" }
  });

  const currentTarifaByModalidad = useMemo(() => {
    const byModalidad: Record<TarifaModalidad, Tarifa | null> = {
      HIBRIDA: null,
      VIRTUAL: null
    };
    for (const modalidad of ["HIBRIDA", "VIRTUAL"] as const) {
      const active = tarifas.find((rate) => rate.modalidadReunion === modalidad && rate.estado === "ACTIVA");
      byModalidad[modalidad] = active ?? tarifas.find((rate) => rate.modalidadReunion === modalidad) ?? null;
    }
    return byModalidad;
  }, [tarifas]);

  useEffect(() => {
    setTarifaFormByModalidad((prev) => ({
      HIBRIDA: {
        valorHora: currentTarifaByModalidad.HIBRIDA?.valorHora ?? prev.HIBRIDA.valorHora,
        moneda: (currentTarifaByModalidad.HIBRIDA?.moneda ?? prev.HIBRIDA.moneda).toUpperCase()
      },
      VIRTUAL: {
        valorHora: currentTarifaByModalidad.VIRTUAL?.valorHora ?? prev.VIRTUAL.valorHora,
        moneda: (currentTarifaByModalidad.VIRTUAL?.moneda ?? prev.VIRTUAL.moneda).toUpperCase()
      }
    }));
  }, [currentTarifaByModalidad]);

  return {
    tarifas,
    setTarifas,
    isSubmittingTarifa,
    setIsSubmittingTarifa,
    tarifaFormByModalidad,
    setTarifaFormByModalidad,
    currentTarifaByModalidad
  };
}
