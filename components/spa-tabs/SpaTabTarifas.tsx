"use client";

import type { Tarifa } from "@/src/services/tarifasApi";
import type { TarifaConfigForm, TarifaModalidad } from "@/src/hooks/useTarifas";

interface SpaTabTarifasProps {
  tarifaFormByModalidad: Record<TarifaModalidad, TarifaConfigForm>;
  setTarifaFormByModalidad: (
    form:
      | Record<TarifaModalidad, TarifaConfigForm>
      | ((prev: Record<TarifaModalidad, TarifaConfigForm>) => Record<TarifaModalidad, TarifaConfigForm>)
  ) => void;
  isSubmittingTarifa: boolean;
  currentTarifaByModalidad: Record<TarifaModalidad, Tarifa | undefined>;
  onSubmit: (modalidad: TarifaModalidad) => void | Promise<void>;
}

const modalidadCards: Array<{ key: TarifaModalidad; label: string }> = [
  { key: "VIRTUAL", label: "Virtual" },
  { key: "HIBRIDA", label: "Hibrida" }
];

export function SpaTabTarifas({
  tarifaFormByModalidad,
  setTarifaFormByModalidad,
  isSubmittingTarifa,
  currentTarifaByModalidad,
  onSubmit
}: SpaTabTarifasProps) {
  return (
    <article className="card">
      <h3 style={{ marginTop: 0 }}>Tarifas por modalidad</h3>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Solo hay dos configuraciones activas en el sistema.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {modalidadCards.map(({ key, label }) => (
          <form
            key={key}
            className="card"
            style={{ padding: 12, display: "grid", gap: 10, alignContent: "start" }}
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit(key);
            }}
          >
            <h4 style={{ margin: 0 }}>{label}</h4>
            <p style={{ margin: 0 }}>
              <strong>Actual:</strong> {currentTarifaByModalidad[key]?.valorHora ?? "-"}{" "}
              {currentTarifaByModalidad[key]?.moneda ?? ""}
            </p>

            <label style={{ display: "block" }}>
              Valor por hora
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={tarifaFormByModalidad[key].valorHora}
                onChange={(e) =>
                  setTarifaFormByModalidad((prev) => ({
                    ...prev,
                    [key]: {
                      ...prev[key],
                      valorHora: e.target.value
                    }
                  }))
                }
              />
            </label>

            <label style={{ display: "block" }}>
              Moneda
              <input
                type="text"
                required
                value={tarifaFormByModalidad[key].moneda}
                onChange={(e) =>
                  setTarifaFormByModalidad((prev) => ({
                    ...prev,
                    [key]: {
                      ...prev[key],
                      moneda: e.target.value.toUpperCase()
                    }
                  }))
                }
              />
            </label>

            <button className="btn primary" type="submit" disabled={isSubmittingTarifa}>
              {isSubmittingTarifa ? "Guardando..." : `Actualizar ${label}`}
            </button>
          </form>
        ))}
      </div>
    </article>
  );
}
