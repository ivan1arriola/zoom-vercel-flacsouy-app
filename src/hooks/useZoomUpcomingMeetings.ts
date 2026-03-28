import { useState } from "react";
import type { ZoomUpcomingMeeting } from "@/src/services/zoomApi";

export function useZoomUpcomingMeetings() {
  const [zoomUpcomingMeetings, setZoomUpcomingMeetings] = useState<ZoomUpcomingMeeting[]>([]);
  const [isLoadingZoomUpcomingMeetings, setIsLoadingZoomUpcomingMeetings] = useState(false);

  return {
    zoomUpcomingMeetings,
    setZoomUpcomingMeetings,
    isLoadingZoomUpcomingMeetings,
    setIsLoadingZoomUpcomingMeetings
  };
}
