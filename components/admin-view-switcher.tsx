"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const viewOptions = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "DOCENTE", label: "Docente" },
  { value: "ASISTENTE_ZOOM", label: "Asistente Zoom" },
  { value: "SOPORTE_ZOOM", label: "Soporte Zoom" },
  { value: "CONTADURIA", label: "Contaduría" }
] as const;

export function AdminViewSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = (searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase();
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
    <label style={{ display: "inline-block", minWidth: 210, textAlign: "left" }}>
      <span className="muted" style={{ fontWeight: 700, fontSize: "0.85rem" }}>
        Modo de vista
      </span>
      <select value={currentValue} onChange={(e) => onChange(e.target.value)} style={{ marginTop: 6 }}>
        {viewOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
