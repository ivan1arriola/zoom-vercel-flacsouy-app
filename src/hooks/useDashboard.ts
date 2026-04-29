import { useState } from "react";
import type { DashboardSummary } from "@/src/services/dashboardApi";

export function useDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [manualPendings, setManualPendings] = useState<Array<{ id: string; titulo: string }>>([]);

  return {
    summary,
    setSummary,
    isLoadingSummary,
    setIsLoadingSummary,
    manualPendings,
    setManualPendings
  };
}
