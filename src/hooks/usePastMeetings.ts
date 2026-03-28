import { useState } from "react";
import type { PastMeeting } from "@/src/services/solicitudesApi";

export function usePastMeetings() {
  const [isSubmittingPastMeeting, setIsSubmittingPastMeeting] = useState(false);
  const [isLoadingPastMeetings, setIsLoadingPastMeetings] = useState(false);
  const [pastMeetings, setPastMeetings] = useState<PastMeeting[]>([]);
  const [pastMeetingForm, setPastMeetingForm] = useState({
    titulo: "",
    modalidadReunion: "VIRTUAL",
    docenteEmail: "",
    responsableEmail: "",
    monitorEmail: "",
    zoomMeetingId: "",
    inicioRealAt: "",
    finRealAt: "",
    programaNombre: "",
    descripcion: "",
    zoomJoinUrl: ""
  });

  return {
    isSubmittingPastMeeting,
    setIsSubmittingPastMeeting,
    isLoadingPastMeetings,
    setIsLoadingPastMeetings,
    pastMeetings,
    setPastMeetings,
    pastMeetingForm,
    setPastMeetingForm
  };
}
