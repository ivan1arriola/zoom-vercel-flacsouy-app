import { useState } from "react";
import type { ZoomAccount } from "@/src/services/zoomApi";

export function useZoomAccounts() {
  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccount[]>([]);
  const [zoomGroupName, setZoomGroupName] = useState("");
  const [isLoadingZoomAccounts, setIsLoadingZoomAccounts] = useState(false);
  const [expandedZoomAccountId, setExpandedZoomAccountId] = useState<string | null>(null);

  return {
    zoomAccounts,
    setZoomAccounts,
    zoomGroupName,
    setZoomGroupName,
    isLoadingZoomAccounts,
    setIsLoadingZoomAccounts,
    expandedZoomAccountId,
    setExpandedZoomAccountId
  };
}
