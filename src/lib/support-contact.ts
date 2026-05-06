export const SUPPORT_EMAIL = "web@flacso.edu.uy";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export function buildSupportContactMessage(prefix = "Ocurrio un error inesperado."): string {
  return `${prefix} Si el problema persiste, contacta a ${SUPPORT_EMAIL}.`;
}
