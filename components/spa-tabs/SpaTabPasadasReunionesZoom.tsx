"use client";

import type { ZoomPastMeeting } from "@/src/services/zoomApi";
import { SpaTabProximasReuniones } from "@/components/spa-tabs/SpaTabProximasReuniones";

interface SpaTabPasadasReunionesZoomProps {
  groupName: string;
  meetings: ZoomPastMeeting[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePostMeetingRecord?: (meeting: ZoomPastMeeting) => void;
}

export function SpaTabPasadasReunionesZoom({
  groupName,
  meetings,
  isLoading,
  onRefresh,
  onCreatePostMeetingRecord
}: SpaTabPasadasReunionesZoomProps) {
  return (
    <SpaTabProximasReuniones
      title="Reuniones pasadas (Zoom)"
      subtitle="Reuniones historicas detectadas en Zoom para validar asociacion con el sistema."
      groupName={groupName}
      meetings={meetings}
      isLoading={isLoading}
      onRefresh={onRefresh}
      onCreatePostMeetingRecord={onCreatePostMeetingRecord}
    />
  );
}

