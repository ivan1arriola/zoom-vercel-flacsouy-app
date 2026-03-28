import { useState } from "react";
import type { ZoomPastMeeting } from "@/src/services/zoomApi";

export function useZoomPastMeetings() {
  const [zoomPastMeetings, setZoomPastMeetings] = useState<ZoomPastMeeting[]>([]);
  const [isLoadingZoomPastMeetings, setIsLoadingZoomPastMeetings] = useState(false);

  return {
    zoomPastMeetings,
    setZoomPastMeetings,
    isLoadingZoomPastMeetings,
    setIsLoadingZoomPastMeetings
  };
}

