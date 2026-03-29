import type { ZoomMonthlyMode, ZoomRecurrenceType } from "@/src/lib/spa-home/recurrence";

export type SolicitudAsistencia = "SI" | "NO";
export type SolicitudGrabacion = "SI" | "NO" | "DEFINIR";
export type SolicitudModalidad = "VIRTUAL" | "HIBRIDA";
export type SolicitudInstancias = "UNA" | "VARIAS";
export type SolicitudVariasModo = "RECURRENCIA_ZOOM" | "FECHAS_ESPECIFICAS";

export type SolicitudFormState = {
  tema: string;
  responsable: string;
  programa: string;
  asistenciaZoom: SolicitudAsistencia;
  modalidad: SolicitudModalidad;
  grabacion: SolicitudGrabacion;
  unaOVarias: SolicitudInstancias;
  variasModo: SolicitudVariasModo;
  descripcionUnica: string;
  diaUnica: string;
  horaInicioUnica: string;
  horaFinUnica: string;
  duracionUnica: string;
  descripcionRecurrente: string;
  primerDiaRecurrente: string;
  horaInicioRecurrente: string;
  horaFinRecurrente: string;
  duracionRecurrente: string;
  recurrenciaTipoZoom: ZoomRecurrenceType;
  recurrenciaIntervalo: string;
  recurrenciaDiasSemana: string;
  recurrenciaMensualModo: ZoomMonthlyMode;
  recurrenciaDiaMes: string;
  recurrenciaSemanaMes: string;
  recurrenciaDiaSemanaMes: string;
  fechaFinal: string;
  fechasEspecificas: string;
  correosDocentes: string;
};

export const DEFAULT_SOLICITUD_FORM: SolicitudFormState = {
  tema: "",
  responsable: "",
  programa: "",
  asistenciaZoom: "SI",
  modalidad: "VIRTUAL",
  grabacion: "NO",
  unaOVarias: "UNA",
  variasModo: "RECURRENCIA_ZOOM",
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
  recurrenciaTipoZoom: "2",
  recurrenciaIntervalo: "1",
  recurrenciaDiasSemana: "2",
  recurrenciaMensualModo: "DAY_OF_MONTH",
  recurrenciaDiaMes: "1",
  recurrenciaSemanaMes: "1",
  recurrenciaDiaSemanaMes: "2",
  fechaFinal: "",
  fechasEspecificas: "",
  correosDocentes: ""
};
