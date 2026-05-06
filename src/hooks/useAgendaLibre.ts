import { useState } from "react";
import type { AgendaEvent } from "@/src/services/agendaApi";

export function useAgendaLibre() {
  const [agendaLibre, setAgendaLibre] = useState<AgendaEvent[]>([]);
  const [updatingInterestId, setUpdatingInterestId] = useState<string | null>(null);
  const [isLoadingAgendaLibre, setIsLoadingAgendaLibre] = useState(false);

  return {
    agendaLibre,
    setAgendaLibre,
    updatingInterestId,
    setUpdatingInterestId,
    isLoadingAgendaLibre,
    setIsLoadingAgendaLibre
  };
}
