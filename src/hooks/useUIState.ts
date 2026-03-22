import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const tabs = [
  "dashboard",
  "solicitudes",
  "agenda_libre",
  "asignacion",
  "manual",
  "historico",
  "cuentas",
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
