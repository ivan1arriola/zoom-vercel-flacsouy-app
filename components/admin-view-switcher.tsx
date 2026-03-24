"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

const SUPPORT_VIEW_ROLE = "SOPORTE_ZOOM";

const viewOptions = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "DOCENTE", label: "Docente" },
  { value: SUPPORT_VIEW_ROLE, label: "Asistente / Soporte Zoom" },
  { value: "CONTADURIA", label: "Contaduria" }
] as const;

function normalizeViewRole(raw: string): string {
  if (raw === "ASISTENTE_ZOOM" || raw === "SOPORTE_ZOOM") {
    return SUPPORT_VIEW_ROLE;
  }
  return raw;
}

export function AdminViewSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = normalizeViewRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
  const currentValue = viewOptions.some((option) => option.value === raw) ? raw : "ADMINISTRADOR";

  function onChange(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === "ADMINISTRADOR") {
      params.delete("viewAs");
    } else {
      params.set("viewAs", nextValue);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <FormControl size="small" sx={{ minWidth: 230 }}>
      <InputLabel id="view-mode-label">Modo de vista</InputLabel>
      <Select
        labelId="view-mode-label"
        value={currentValue}
        label="Modo de vista"
        onChange={(e) => onChange(String(e.target.value))}
      >
        {viewOptions.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
