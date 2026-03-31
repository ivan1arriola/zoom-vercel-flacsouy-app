"use client";

import { useMemo } from "react";
import type { ZoomPastMeeting } from "@/src/services/zoomApi";
import { SpaTabProximasReuniones } from "@/components/spa-tabs/SpaTabProximasReuniones";

type MonthOption = {
  value: string;
  label: string;
  monthsBack: number;
};

interface SpaTabPasadasReunionesZoomProps {
  groupName: string;
  meetings: ZoomPastMeeting[];
  isLoading: boolean;
  onRefresh: () => void;
  onCreatePostMeetingRecord?: (meeting: ZoomPastMeeting) => void;
  monthOptions: MonthOption[];
  selectedMonthKey: string;
  onSelectMonthKey: (monthKey: string) => void;
}

function getMonthKeyFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function SpaTabPasadasReunionesZoom({
  groupName,
  meetings,
  isLoading,
  onRefresh,
  onCreatePostMeetingRecord,
  monthOptions,
  selectedMonthKey,
  onSelectMonthKey
}: SpaTabPasadasReunionesZoomProps) {
  const filteredMeetings = useMemo(() => {
    if (!selectedMonthKey) return meetings;
    return meetings.filter((meeting) => getMonthKeyFromIso(meeting.startTime) === selectedMonthKey);
  }, [meetings, selectedMonthKey]);

  return (
    <SpaTabProximasReuniones
      title="Reuniones pasadas (Zoom)"
      subtitle="Historial detectado en Zoom para validar o crear la asociacion con el sistema."
      groupName={groupName}
      meetings={filteredMeetings}
      isLoading={isLoading}
      onRefresh={onRefresh}
      onCreatePostMeetingRecord={onCreatePostMeetingRecord}
      enablePastMeetingDetails
      defaultDetailsExpanded
      monthOptions={monthOptions.map((option) => ({
        value: option.value,
        label: option.label
      }))}
      selectedMonth={selectedMonthKey}
      onSelectMonth={onSelectMonthKey}
      isLoadingMonthSelection={isLoading}
    />
  );
}
