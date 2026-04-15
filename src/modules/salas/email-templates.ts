import {
  EstadoEventoZoom,
  EstadoInteresAsistente,
  EstadoSolicitudSala,
  ModalidadReunion
} from "@prisma/client";
import { env } from "@/src/lib/env";

type BrandedEmailLayoutInput = {
  preheader: string;
  title: string;
  greeting?: string;
  paragraphs?: string[];
  contentHtml?: string;
  actionLabel?: string;
  actionUrl?: string;
  metaLines?: string[];
  footerLine?: string;
  kicker?: string;
};

export type AdminInfoDigestEmailItem = {
  createdAtIso: string;
  subject: string;
  title: string;
  summary: string;
  metaLines: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTimeForEmail(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("es-UY", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone || "America/Montevideo"
  });
  return formatter.format(date);
}

function getSolicitudStatusLabel(status: EstadoSolicitudSala | "PENDIENTE_ASISTENCIA_ZOOM"): string {
  switch (status) {
    case "PENDIENTE_ASISTENCIA_ZOOM":
      return "Pendiente de asistencia Zoom";
    case EstadoSolicitudSala.PROVISIONADA:
      return "Provisionada";
    case EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID:
      return "Pendiente manual";
    case EstadoSolicitudSala.CANCELADA_DOCENTE:
      return "Cancelada por docente";
    case EstadoSolicitudSala.CANCELADA_ADMIN:
      return "Cancelada por administracion";
    default:
      return status;
  }
}

function formatAssistantInterestLabel(estadoInteres: EstadoInteresAsistente): string {
  if (estadoInteres === EstadoInteresAsistente.ME_INTERESA) return "Me postulo";
  if (estadoInteres === EstadoInteresAsistente.RETIRADO) return "No voy a postular";
  return "No voy a postular";
}

function getEmailBaseUrl(): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL;
  return "http://localhost:3000";
}

function buildBrandedEmailLayout(input: BrandedEmailLayoutInput): string {
  const baseUrl = getEmailBaseUrl();
  const brandingBaseUrl = `${baseUrl.replace(/\/$/, "")}/branding`;
  const secondaryWhiteLogoUrl = `${brandingBaseUrl}/flacso-uruguay-secondary-white.png`;
  const preheader = escapeHtml(input.preheader);
  const title = escapeHtml(input.title);
  const kicker = escapeHtml(input.kicker ?? "Plataforma Zoom de FLACSO Uruguay");
  const greeting = (input.greeting ?? "").trim();
  const greetingHtml = greeting
    ? `<p style="margin:0 0 14px 0;color:#223042;font-size:16px;line-height:1.6;font-weight:700;">${escapeHtml(greeting)}</p>`
    : "";
  const paragraphsHtml = (input.paragraphs ?? [])
    .map((line) => `<p style="margin:0 0 14px 0;color:#223042;font-size:16px;line-height:1.6;">${escapeHtml(line)}</p>`)
    .join("");
  const actionUrl = (input.actionUrl ?? "").trim();
  const actionBlock =
    input.actionLabel && actionUrl
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0 16px 0;">
        <tr>
          <td align="center" style="border-radius:10px;background:#1d3a72;">
            <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 20px;font-weight:700;font-size:15px;line-height:1.2;color:#ffffff;text-decoration:none;">${escapeHtml(input.actionLabel)}</a>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 14px 0;color:#536074;font-size:13px;line-height:1.5;">Si el boton no funciona, copia y pega este enlace:<br/><a href="${escapeHtml(actionUrl)}" style="color:#1d3a72;word-break:break-all;">${escapeHtml(actionUrl)}</a></p>
    `
      : "";
  const metaBlock =
    input.metaLines && input.metaLines.length > 0
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 0 0;">${input.metaLines
          .map(
            (line) =>
              `<tr><td style="padding:0 8px 8px 0;color:#1d3a72;font-size:14px;">•</td><td style="padding:0 0 8px 0;color:#425066;font-size:14px;line-height:1.5;">${escapeHtml(line)}</td></tr>`
          )
          .join("")}</table>`
      : "";
  const footerLine = escapeHtml(
    input.footerLine ??
      "Este es un mensaje automatico de FLACSO Uruguay. Si no reconoces esta accion, ignora este correo."
  );
  const contentHtml = input.contentHtml ?? "";

  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:20px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;border-collapse:collapse;">
            <tr>
              <td style="border-radius:14px 14px 0 0;padding:20px 24px;background:linear-gradient(135deg,#1d3a72,#254c95);">
                <img src="${escapeHtml(secondaryWhiteLogoUrl)}" alt="FLACSO Uruguay" style="height:42px;display:block;" />
                <p style="margin:18px 0 6px 0;color:#cfd8ea;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">${kicker}</p>
                <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:800;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;padding:26px 24px;border-left:1px solid #dbe3f0;border-right:1px solid #dbe3f0;">
                ${greetingHtml}
                ${paragraphsHtml}
                ${contentHtml}
                ${actionBlock}
                ${metaBlock}
              </td>
            </tr>
            <tr>
              <td style="background:linear-gradient(135deg,#1d3a72,#254c95);padding:16px 24px;border:1px solid #1d3a72;border-top:0;border-radius:0 0 14px 14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;color:#dbe8ff;font-size:12px;line-height:1.5;">${footerLine}</p>
                    </td>
                    <td align="right" style="padding-left:12px;vertical-align:middle;">
                      <img src="${escapeHtml(secondaryWhiteLogoUrl)}" alt="FLACSO Uruguay" style="height:24px;display:block;" />
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

function buildMeetingDetailsEmailHtml(input: {
  meetingId?: string | null;
  joinUrl?: string | null;
  hostAccount?: string | null;
  meetingPassword?: string | null;
  requiresAssistance?: boolean | null;
  assignedAssistantName?: string | null;
}): string {
  const meetingIdLabel = escapeHtml((input.meetingId ?? "").trim() || "No disponible");
  const hostAccountLabel = escapeHtml((input.hostAccount ?? "").trim() || "No disponible");
  const passwordLabel = escapeHtml((input.meetingPassword ?? "").trim() || "No disponible");
  const joinUrl = (input.joinUrl ?? "").trim();
  const joinUrlHtml = joinUrl
    ? `<a href="${escapeHtml(joinUrl)}" target="_blank" rel="noreferrer" style="color:#1d4ed8;text-decoration:underline;word-break:break-all;">${escapeHtml(joinUrl)}</a>`
    : "No disponible";

  const requiresAssistanceLabel =
    input.requiresAssistance === true
      ? "Si"
      : input.requiresAssistance === false
        ? "No"
        : "No especificado";
  const resolvedAssistant = (input.assignedAssistantName ?? "").trim();
  const assistantLabel =
    input.requiresAssistance === false
      ? "No aplica"
      : resolvedAssistant || "Pendiente de asignacion";

  return `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#ffffff;margin:0 0 14px;">
      <p style="margin:0 0 8px;font-weight:700;color:#0b2c5e;">Detalles de la reunion</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>ID de reunion:</strong> ${meetingIdLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Link completo:</strong> ${joinUrlHtml}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Cuenta:</strong> ${hostAccountLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Contrasena de la cuenta:</strong> ${passwordLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Requiere asistencia:</strong> ${escapeHtml(requiresAssistanceLabel)}</p>
      <p style="margin:0;color:#223042;"><strong>Quien va a asistir:</strong> ${escapeHtml(assistantLabel)}</p>
    </div>
  `;
}

export function buildProvisionedSolicitudEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  modalidad: ModalidadReunion;
  meetingId: string | null;
  joinUrl: string | null;
  meetingPassword: string | null;
  hostAccount: string | null;
  requiresAssistance?: boolean | null;
  assignedAssistantName?: string | null;
  timezone: string;
  instanceStarts: Date[];
}): string {
  const {
    titulo,
    modalidad,
    meetingId,
    joinUrl,
    meetingPassword,
    hostAccount,
    timezone,
    instanceStarts
  } = input;

  const previewCount = Math.min(instanceStarts.length, 30);
  const previewRows = instanceStarts
    .slice(0, previewCount)
    .map((date, index) => `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(date, timezone))}</li>`)
    .join("");
  const extraCount = instanceStarts.length - previewCount;
  const meetingLabel = escapeHtml(meetingId ?? "-");
  const modalidadLabel = escapeHtml(modalidad);
  const titleLabel = escapeHtml(titulo);
  const hasManyInstances = instanceStarts.length > 1;
  const meetingDetailsHtml = buildMeetingDetailsEmailHtml({
    meetingId,
    joinUrl,
    hostAccount,
    meetingPassword,
    requiresAssistance: input.requiresAssistance,
    assignedAssistantName: input.assignedAssistantName
  });
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>ID de reunion:</strong> ${meetingLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${instanceStarts.length}</p>
    </div>
    ${meetingDetailsHtml}
    <p style="margin:0 0 8px;color:#223042;"><strong>Fechas programadas</strong></p>
    <ol style="margin:0 0 12px;padding-left:20px;color:#223042;">
      ${previewRows}
    </ol>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: hasManyInstances
      ? "Tu serie fue confirmada y ya esta disponible en Zoom."
      : "Tu reunion fue confirmada y ya esta disponible en Zoom.",
    title: "Tu reunion esta lista",
    greeting: "Hola,",
    paragraphs: [
      hasManyInstances
        ? "Tu serie fue confirmada y ya esta disponible en Zoom."
        : "Tu reunion fue confirmada y ya esta disponible en Zoom."
    ],
    contentHtml,
    actionLabel: joinUrl ? "Abrir reunion en Zoom" : undefined,
    actionUrl: joinUrl ?? undefined,
    metaLines: ["Si necesitas cambios, responde a este correo o contacta al equipo de coordinacion."]
  });
}

export function buildMonitoringRequiredEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  modalidad: ModalidadReunion;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  meetingId?: string | null;
  joinUrl?: string | null;
  hostAccount?: string | null;
  meetingPassword?: string | null;
  requiresAssistance?: boolean | null;
  assignedAssistantName?: string | null;
  timezone: string;
  instanceStarts: Date[];
  estadoSolicitud: EstadoSolicitudSala;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const modalidadLabel = escapeHtml(input.modalidad);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const responsableLabel = escapeHtml(input.responsableNombre?.trim() || "-");
  const statusLabel = escapeHtml(input.estadoSolicitud);
  const meetingDetailsHtml = buildMeetingDetailsEmailHtml({
    meetingId: input.meetingId,
    joinUrl: input.joinUrl,
    hostAccount: input.hostAccount,
    meetingPassword: input.meetingPassword,
    requiresAssistance: input.requiresAssistance ?? true,
    assignedAssistantName: input.assignedAssistantName
  });
  const previewCount = Math.min(input.instanceStarts.length, 20);
  const previewRows = input.instanceStarts
    .slice(0, previewCount)
    .map((date, index) => `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(date, input.timezone))}</li>`)
    .join("");
  const extraCount = input.instanceStarts.length - previewCount;
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Responsable:</strong> ${responsableLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Estado:</strong> ${statusLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${input.instanceStarts.length}</p>
    </div>
    ${meetingDetailsHtml}
    <p style="margin:0 0 8px;color:#223042;"><strong>Fechas previstas</strong></p>
    <ol style="margin:0 0 12px;padding-left:20px;color:#223042;">
      ${previewRows}
    </ol>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Se registro una nueva solicitud que requiere asistencia Zoom.",
    title: "Nueva solicitud con monitoreo requerido",
    greeting: "Hola,",
    paragraphs: ["Se registro una nueva solicitud que requiere asistencia Zoom."],
    contentHtml,
    metaLines: ["Revisa la seccion Reuniones disponibles para marcar interes en las instancias abiertas."]
  });
}

export function buildAdminInfoDigestEmailHtml(items: AdminInfoDigestEmailItem[]): string {
  const rows = items
    .map((item, index) => {
      const createdAt = new Date(item.createdAtIso);
      const createdLabel = Number.isNaN(createdAt.getTime())
        ? item.createdAtIso
        : formatDateTimeForEmail(createdAt, "America/Montevideo");
      const metaHtml = (item.metaLines ?? []).length
        ? `<ul style="margin:6px 0 0 18px;padding:0;color:#425066;font-size:13px;line-height:1.5;">${(item.metaLines ?? [])
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("")}</ul>`
        : "";

      return `
        <div style="border:1px solid #dbe5f3;border-radius:10px;padding:12px;background:#f8fbff;margin:0 0 10px;">
          <p style="margin:0 0 4px;color:#1d3a72;font-size:12px;font-weight:700;">#${index + 1} • ${escapeHtml(createdLabel)}</p>
          <p style="margin:0 0 6px;color:#0b2c5e;font-size:16px;font-weight:700;">${escapeHtml(item.title)}</p>
          <p style="margin:0 0 6px;color:#223042;font-size:14px;"><strong>Asunto:</strong> ${escapeHtml(item.subject)}</p>
          <p style="margin:0;color:#223042;font-size:14px;line-height:1.5;">${escapeHtml(item.summary)}</p>
          ${metaHtml}
        </div>
      `;
    })
    .join("");

  const contentHtml = `
    <p style="margin:0 0 10px;color:#223042;">Este resumen agrupa notificaciones informativas para reducir volumen de correo.</p>
    ${rows}
  `;

  return buildBrandedEmailLayout({
    preheader: "Resumen de notificaciones informativas para admins.",
    title: "Resumen operativo para admins",
    greeting: "Hola,",
    paragraphs: [`Incluye ${items.length} evento(s) informativo(s) recientes.`],
    contentHtml,
    metaLines: [
      "Las alertas criticas se siguen enviando de forma inmediata.",
      "Este resumen se emite cada 45 minutos o al acumular suficientes eventos."
    ]
  });
}

export function buildAssistantPreferenceAdminEmailHtml(input: {
  asistenteNombre: string;
  asistenteEmail: string;
  estadoInteres: EstadoInteresAsistente;
  comentario?: string;
  solicitudId: string;
  eventoId: string;
  meetingId?: string | null;
  joinUrl?: string | null;
  hostAccount?: string | null;
  meetingPassword?: string | null;
  requiresAssistance?: boolean | null;
  assignedAssistantName?: string | null;
  titulo: string;
  programaNombre?: string | null;
  inicio: Date;
  fin: Date;
  timezone: string;
}): string {
  const asistenteNombreLabel = escapeHtml(input.asistenteNombre);
  const asistenteEmailLabel = escapeHtml(input.asistenteEmail);
  const estadoLabel = escapeHtml(formatAssistantInterestLabel(input.estadoInteres));
  const tituloLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const inicioLabel = escapeHtml(formatDateTimeForEmail(input.inicio, input.timezone));
  const finLabel = escapeHtml(formatDateTimeForEmail(input.fin, input.timezone));
  const comentarioLabel = escapeHtml((input.comentario ?? "").trim() || "Sin comentario");
  const meetingDetailsHtml = buildMeetingDetailsEmailHtml({
    meetingId: input.meetingId,
    joinUrl: input.joinUrl,
    hostAccount: input.hostAccount,
    meetingPassword: input.meetingPassword,
    requiresAssistance: input.requiresAssistance,
    assignedAssistantName: input.assignedAssistantName
  });
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${tituloLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Asistente:</strong> ${asistenteNombreLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Email asistente:</strong> ${asistenteEmailLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Preferencia:</strong> ${estadoLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Inicio:</strong> ${inicioLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Fin:</strong> ${finLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Comentario:</strong> ${comentarioLabel}</p>
    </div>
    ${meetingDetailsHtml}
  `;

  return buildBrandedEmailLayout({
    preheader: "Un asistente Zoom registro su preferencia para una instancia.",
    title: "Preferencia de asistencia actualizada",
    greeting: "Hola,",
    paragraphs: ["Un asistente Zoom registro su preferencia para una instancia."],
    contentHtml
  });
}

export function buildAssignmentNotificationHtml(input: {
  solicitudId: string;
  eventoId: string;
  titulo: string;
  programaNombre?: string | null;
  modalidad: ModalidadReunion;
  inicio: Date;
  fin: Date;
  timezone: string;
  meetingId?: string | null;
  joinUrl?: string | null;
  hostAccount?: string | null;
  meetingPassword?: string | null;
  requiresAssistance?: boolean | null;
  asistenteNombre: string;
  asistenteEmail: string;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const modalidadLabel = escapeHtml(input.modalidad);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const asistenteNombreLabel = escapeHtml(input.asistenteNombre);
  const asistenteEmailLabel = escapeHtml(input.asistenteEmail);
  const inicioLabel = escapeHtml(formatDateTimeForEmail(input.inicio, input.timezone));
  const finLabel = escapeHtml(formatDateTimeForEmail(input.fin, input.timezone));
  const meetingDetailsHtml = buildMeetingDetailsEmailHtml({
    meetingId: input.meetingId,
    joinUrl: input.joinUrl,
    hostAccount: input.hostAccount,
    meetingPassword: input.meetingPassword,
    requiresAssistance: input.requiresAssistance,
    assignedAssistantName: input.asistenteNombre
  });
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Inicio:</strong> ${inicioLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Fin:</strong> ${finLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Asistente asignado:</strong> ${asistenteNombreLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Email asistente:</strong> ${asistenteEmailLabel}</p>
    </div>
    ${meetingDetailsHtml}
  `;

  return buildBrandedEmailLayout({
    preheader: "Se confirmo la persona de asistencia para esta instancia.",
    title: "Asignacion de monitoreo confirmada",
    greeting: "Hola,",
    paragraphs: ["Se confirmo la persona de asistencia para esta instancia."],
    contentHtml,
    actionLabel: input.joinUrl ? "Abrir reunion en Zoom" : undefined,
    actionUrl: input.joinUrl ?? undefined
  });
}

export function buildAssistanceCancelledEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  meetingId?: string | null;
  joinUrl?: string | null;
  hostAccount?: string | null;
  meetingPassword?: string | null;
  requiresAssistance?: boolean | null;
  assignedAssistantName?: string | null;
  timezone: string;
  recipientName: string;
  actorNombre: string;
  actorEmail: string;
  motivo?: string | null;
  instancias: Array<{
    inicio: Date;
    fin: Date;
  }>;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const responsableLabel = escapeHtml(input.responsableNombre?.trim() || "-");
  const actorLabel = escapeHtml(input.actorNombre);
  const actorEmailLabel = escapeHtml(input.actorEmail);
  const motivoLabel = escapeHtml((input.motivo ?? "").trim() || "Sin detalle adicional.");
  const meetingDetailsHtml = buildMeetingDetailsEmailHtml({
    meetingId: input.meetingId,
    joinUrl: input.joinUrl,
    hostAccount: input.hostAccount,
    meetingPassword: input.meetingPassword,
    requiresAssistance: input.requiresAssistance,
    assignedAssistantName: input.assignedAssistantName
  });
  const previewCount = Math.min(input.instancias.length, 30);
  const previewRows = input.instancias
    .slice(0, previewCount)
    .map(
      (item, index) =>
        `<li>${index + 1}. ${escapeHtml(formatDateTimeForEmail(item.inicio, input.timezone))} - ${escapeHtml(formatDateTimeForEmail(item.fin, input.timezone))}</li>`
    )
    .join("");
  const extraCount = input.instancias.length - previewCount;
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f8fbff;margin:0 0 16px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Responsable:</strong> ${responsableLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Actualizado por:</strong> ${actorLabel} (${actorEmailLabel})</p>
      <p style="margin:0;color:#223042;"><strong>Motivo:</strong> ${motivoLabel}</p>
    </div>
    ${meetingDetailsHtml}
    <p style="margin:0 0 8px;color:#223042;font-weight:700;">Instancias afectadas:</p>
    <ol style="margin:0 0 14px 18px;padding:0;color:#223042;line-height:1.5;">${previewRows}</ol>
    ${
      extraCount > 0
        ? `<p style="margin:0;color:#5b6576;font-size:13px;">Se omitieron ${extraCount} instancia(s) adicionales en este resumen.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Se cancelo la asistencia Zoom asignada para una solicitud.",
    title: "Asistencia Zoom cancelada",
    greeting: `Hola ${input.recipientName},`,
    paragraphs: ["Se actualizo una solicitud y ya no requiere asistencia Zoom."],
    contentHtml
  });
}

export function buildSolicitudReminderEmailHtml(input: {
  solicitudId: string;
  titulo: string;
  programaNombre?: string | null;
  responsableNombre?: string | null;
  modalidad: ModalidadReunion;
  estadoSolicitud: EstadoSolicitudSala;
  meetingId: string | null;
  joinUrl: string | null;
  meetingPassword: string | null;
  hostAccount: string | null;
  timezone: string;
  recordatorioMensaje?: string | null;
  actorNombre: string;
  actorEmail: string;
  instancias: Array<{
    inicio: Date;
    fin: Date;
    estadoEvento: EstadoEventoZoom;
    requiereAsistencia: boolean;
    monitorLabel: string | null;
    joinUrl: string | null;
  }>;
}): string {
  const titleLabel = escapeHtml(input.titulo);
  const programaLabel = escapeHtml(input.programaNombre?.trim() || "-");
  const responsableLabel = escapeHtml(input.responsableNombre?.trim() || "-");
  const modalidadLabel = escapeHtml(input.modalidad);
  const estadoLabel = escapeHtml(getSolicitudStatusLabel(input.estadoSolicitud));
  const actorNombreLabel = escapeHtml(input.actorNombre);
  const actorEmailLabel = escapeHtml(input.actorEmail);
  const requiresAnyAssistance = input.instancias.some((item) => item.requiereAsistencia);
  const assignedNames = Array.from(
    new Set(input.instancias.map((item) => (item.monitorLabel ?? "").trim()).filter(Boolean))
  );
  const assignedAssistantName =
    assignedNames.length === 1
      ? assignedNames[0]
      : assignedNames.length > 1
        ? "Asignacion por instancia (ver detalle)"
        : null;
  const meetingDetailsHtml = buildMeetingDetailsEmailHtml({
    meetingId: input.meetingId,
    joinUrl: input.joinUrl,
    hostAccount: input.hostAccount,
    meetingPassword: input.meetingPassword,
    requiresAssistance: requiresAnyAssistance,
    assignedAssistantName
  });
  const previewCount = Math.min(input.instancias.length, 40);
  const previewRows = input.instancias
    .slice(0, previewCount)
    .map((item, index) => {
      const rango = `${formatDateTimeForEmail(item.inicio, input.timezone)} - ${formatDateTimeForEmail(item.fin, input.timezone)}`;
      const statusLabel = item.estadoEvento === EstadoEventoZoom.CANCELADO ? "Cancelada" : "Programada";
      const monitorLine = item.requiereAsistencia
        ? `<p style="margin: 0 0 6px; color: #334155;"><strong>Asistencia Zoom:</strong> ${escapeHtml(item.monitorLabel?.trim() || "Pendiente")}</p>`
        : "";
      const linkLine = item.joinUrl
        ? `<p style="margin: 0;"><a href="${escapeHtml(item.joinUrl)}" target="_blank" rel="noreferrer" style="color: #1d4ed8; text-decoration: underline;">Abrir instancia</a></p>`
        : "";
      return `
        <li style="margin: 0 0 12px;">
          <div style="border: 1px solid #dbe5f3; border-radius: 10px; padding: 10px 12px; background: #ffffff;">
            <p style="margin: 0 0 6px; font-weight: 700; color: #0f172a;">Instancia ${index + 1}</p>
            <p style="margin: 0 0 6px; color: #334155;">${escapeHtml(rango)}</p>
            <p style="margin: 0 0 6px; color: #334155;"><strong>Estado:</strong> ${escapeHtml(statusLabel)}</p>
            ${monitorLine}
            ${linkLine}
          </div>
        </li>
      `;
    })
    .join("");
  const extraCount = input.instancias.length - previewCount;
  const reminderMessage = (input.recordatorioMensaje ?? "").trim();
  const contentHtml = `
    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#f1f7ff;margin:0 0 14px;">
      <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0b2c5e;">${titleLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Instancias:</strong> ${input.instancias.length}</p>
    </div>
    ${meetingDetailsHtml}

    <div style="border:1px solid #dbe5f3;border-radius:12px;padding:14px;background:#ffffff;margin:0 0 14px;">
      <p style="margin:0 0 6px;color:#223042;"><strong>Programa:</strong> ${programaLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Responsable:</strong> ${responsableLabel}</p>
      <p style="margin:0 0 6px;color:#223042;"><strong>Modalidad:</strong> ${modalidadLabel}</p>
      <p style="margin:0;color:#223042;"><strong>Estado:</strong> ${estadoLabel}</p>
    </div>

    ${
      reminderMessage
        ? `<div style="border-left:4px solid #1f4b8f;padding:10px 12px;background:#eff6ff;margin:0 0 14px;">
            <p style="margin:0 0 6px;font-weight:700;color:#223042;">Mensaje adicional</p>
            <p style="margin:0;color:#223042;">${escapeHtml(reminderMessage)}</p>
          </div>`
        : ""
    }

    <p style="margin:0 0 8px;color:#223042;"><strong>Detalle de instancias</strong></p>
    <ul style="margin:0;padding:0;list-style:none;">
      ${previewRows}
    </ul>
    ${
      extraCount > 0
        ? `<p style="margin:0 0 12px;color:#475569;">... y ${extraCount} instancia(s) mas.</p>`
        : ""
    }
  `;

  return buildBrandedEmailLayout({
    preheader: "Te compartimos nuevamente la informacion operativa de esta reunion.",
    title: "Recordatorio de reunion",
    greeting: "Hola,",
    paragraphs: ["Te compartimos nuevamente la informacion operativa de esta reunion."],
    contentHtml,
    actionLabel: input.joinUrl ? "Abrir reunion en Zoom" : undefined,
    actionUrl: input.joinUrl ?? undefined,
    metaLines: [`Recordatorio enviado por ${actorNombreLabel} (${actorEmailLabel}).`]
  });
}
