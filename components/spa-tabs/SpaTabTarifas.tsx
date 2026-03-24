"use client";

import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography
} from "@mui/material";
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
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Tarifas por modalidad
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Solo hay dos configuraciones activas en el sistema.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 2
          }}
        >
          {modalidadCards.map(({ key, label }) => (
            <Card
              key={key}
              variant="outlined"
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmit(key);
              }}
              sx={{ borderRadius: 2 }}
            >
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Actual: {currentTarifaByModalidad[key]?.valorHora ?? "-"} {currentTarifaByModalidad[key]?.moneda ?? ""}
                  </Typography>

                  <TextField
                    label="Valor por hora"
                    type="number"
                    required
                    inputProps={{ min: 0, step: 0.01 }}
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

                  <TextField
                    label="Moneda"
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

                  <Button type="submit" variant="contained" disabled={isSubmittingTarifa}>
                    {isSubmittingTarifa ? "Guardando..." : `Actualizar ${label}`}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
