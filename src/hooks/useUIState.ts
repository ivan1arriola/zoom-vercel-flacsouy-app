import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const tabs = [
  "dashboard",
  "solicitudes",
  "programas",
  "agenda_libre",
  "mis_reuniones_asignadas",
  "mis_asistencias",
  "asignacion",
  "manual",
  "historico",
  "cuentas",
  "proximas_zoom",
  "pasadas_zoom",
  "estadisticas",
  "tarifas",
  "usuarios",
  "perfil"
] as const;
type Tab = (typeof tabs)[number];

export function useUIState() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const requestedTab = useMemo(() => {
    const rawTab = (searchParams.get("tab") ?? "").toLowerCase();
    if (!rawTab) return null;
    if (rawTab === "agenda") return "agenda_libre" as Tab;
    if (rawTab === "asistencias") return "mis_asistencias" as Tab;
    if (rawTab === "proximas") return "proximas_zoom" as Tab;
    if (rawTab === "pasadas") return "pasadas_zoom" as Tab;
    if (rawTab === "programa") return "programas" as Tab;
    return tabs.includes(rawTab as Tab) ? (rawTab as Tab) : null;
  }, [searchParams]);

  return {
    tab,
    setTab,
    message,
    setMessage,
    loading,
    setLoading,
    requestedTab,
    tabs,
    searchParams
  };
}
