"use client";

import type { ZoomPastMeeting } from "@/src/services/zoomApi";
import { SpaTabProximasReuniones } from "@/components/spa-tabs/SpaTabProximasReuniones";

interface SpaTabPasadasReunionesZoomProps {
  groupName: string;
  meetings: ZoomPastMeeting[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePostMeetingRecord?: (meeting: ZoomPastMeeting) => void;
  onLoadMoreBack?: () => void;
  canLoadMoreBack?: boolean;
  isLoadingMoreBack?: boolean;
}

export function SpaTabPasadasReunionesZoom({
  groupName,
  meetings,
  isLoading,
  onRefresh,
  onCreatePostMeetingRecord,
  onLoadMoreBack,
  canLoadMoreBack,
  isLoadingMoreBack
}: SpaTabPasadasReunionesZoomProps) {
  return (
    <SpaTabProximasReuniones
      title="Reuniones pasadas (Zoom)"
      subtitle="Historial detectado en Zoom para validar o crear la asociacion con el sistema."
      groupName={groupName}
      meetings={meetings}
      isLoading={isLoading}
      onRefresh={onRefresh}
      onCreatePostMeetingRecord={onCreatePostMeetingRecord}
      enablePastMeetingDetails
      defaultDetailsExpanded
      onLoadMoreBack={onLoadMoreBack}
      canLoadMoreBack={canLoadMoreBack}
      isLoadingMoreBack={isLoadingMoreBack}
    />
  );
}
