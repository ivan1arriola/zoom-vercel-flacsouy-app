import { useState } from "react";
import type { AgendaEvent } from "@/src/services/agendaApi";

export function useAgendaLibre() {
  const [agendaLibre, setAgendaLibre] = useState<AgendaEvent[]>([]);
  const [updatingInterestId, setUpdatingInterestId] = useState<string | null>(null);

  return {
    agendaLibre,
    setAgendaLibre,
    updatingInterestId,
    setUpdatingInterestId
  };
}
