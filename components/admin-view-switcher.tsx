"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";

const VIEW_ROLE_COOKIE = "zoom_view_as";

const viewOptions = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "DOCENTE", label: "Docente" },
  { value: "CONTADURIA", label: "Contaduria" }
] as const;

function normalizeViewRole(raw: string): string {
  return raw;
}

function persistViewRoleCookie(role: string): void {
  if (typeof document === "undefined") return;
  if (role === "ADMINISTRADOR") {
    document.cookie = `${VIEW_ROLE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    return;
  }
  document.cookie = `${VIEW_ROLE_COOKIE}=${encodeURIComponent(role)}; path=/; max-age=604800; samesite=lax`;
}

export function AdminViewSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = normalizeViewRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
  const currentValue = viewOptions.some((option) => option.value === raw) ? raw : "ADMINISTRADOR";

  function onChange(nextValue: string) {
    persistViewRoleCookie(nextValue);
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
