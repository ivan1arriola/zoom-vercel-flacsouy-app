import { useState } from "react";
import type { Solicitud } from "@/src/services/solicitudesApi";
import type { ZoomRecurrenceType, ZoomMonthlyMode } from "@/src/lib/spa-home/recurrence";

export function useSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [docenteSolicitudesView, setDocenteSolicitudesView] = useState<"form" | "list">("list");
  const [isSubmittingSolicitud, setIsSubmittingSolicitud] = useState(false);
  const [deletingSolicitudId, setDeletingSolicitudId] = useState<string | null>(null);
  const [form, setForm] = useState({
    tema: "",
    responsable: "",
    programa: "",
    asistenciaZoom: "SI",
    modalidad: "VIRTUAL",
    grabacion: "NO",
    unaOVarias: "UNA",
    controlAsistencia: "NO",
    descripcionUnica: "",
    diaUnica: "",
    horaInicioUnica: "",
    horaFinUnica: "",
    duracionUnica: "",
    descripcionRecurrente: "",
    primerDiaRecurrente: "",
    horaInicioRecurrente: "",
    horaFinRecurrente: "",
    duracionRecurrente: "",
    recurrenciaTipoZoom: "2" as ZoomRecurrenceType,
    recurrenciaIntervalo: "1",
    recurrenciaDiasSemana: "2",
    recurrenciaMensualModo: "DAY_OF_MONTH" as ZoomMonthlyMode,
    recurrenciaDiaMes: "1",
    recurrenciaSemanaMes: "1",
    recurrenciaDiaSemanaMes: "2",
    fechaFinal: "",
    correosDocentes: ""
  });

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return {
    solicitudes,
    setSolicitudes,
    docenteSolicitudesView,
    setDocenteSolicitudesView,
    isSubmittingSolicitud,
    setIsSubmittingSolicitud,
    deletingSolicitudId,
    setDeletingSolicitudId,
    form,
    setForm,
    updateForm
  };
}
