// Export all spa-tabs components and utilities for easy importing

export { SpaTabDashboard } from "./SpaTabDashboard";
export { SpaTabSolicitudes } from "./SpaTabSolicitudes";
export { SpaTabAgendaLibre } from "./SpaTabAgendaLibre";
export { SpaTabAsignacion } from "./SpaTabAsignacion";
export { SpaTabManual } from "./SpaTabManual";
export { SpaTabHistorico } from "./SpaTabHistorico";
export { SpaTabTarifas } from "./SpaTabTarifas";
export { SpaTabCuentas } from "./SpaTabCuentas";
export { SpaTabUsuarios } from "./SpaTabUsuarios";
export { SpaTabPerfil } from "./SpaTabPerfil";

export type { CurrentUser } from "../spa-home";

// Utilities
export {
  isLicensedZoomAccount,
  isMeetingStartingSoon,
  formatDurationHoursMinutes,
  formatZoomDateTime,
  formatManagedUserRole,
  formatManagedUserDate,
  formatModalidad,
  normalizeZoomMeetingId,
  resolveZoomJoinUrl,
  getPreparacionDisplay,
  getAssignedPerson,
  getEncargado
} from "./spa-tabs-utils";

// Form validators
export {
  toIso,
  combineDateAndTimeToIso,
  resolveEndByTimeOrDuration,
  validateSolicitudTema,
  validatePastMeetingRequired,
  validateTarifaUpdate,
  validateUserCreation
} from "./form-validators";

export type { ResolvedEndTime } from "./form-validators";
