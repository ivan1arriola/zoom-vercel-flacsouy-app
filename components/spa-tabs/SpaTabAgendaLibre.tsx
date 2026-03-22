"use client";

import { formatDuration } from "@/src/lib/spa-home/recurrence";
import { formatModalidad, isMeetingStartingSoon, getPreparacionDisplay, getEncargado, resolveZoomJoinUrl, formatZoomDateTime } from "./spa-tabs-utils";
import type { AgendaEvent } from "@/src/services/agendaApi";

interface SpaTabAgendaLibreProps {
  agendaLibre: AgendaEvent[];
  updatingInterestId: string | null;
  onSetInterest: (eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA") => void;
}

export function SpaTabAgendaLibre({
  agendaLibre,
  updatingInterestId,
  onSetInterest
}: SpaTabAgendaLibreProps) {
  return (
    <article className="card">
      <h3 style={{ marginTop: 0 }}>Agenda Libre</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Vista para asistentes Zoom. Aqui solo se muestran instancias sin persona asignada.
      </p>
      {agendaLibre.length === 0 && <p className="muted">No hay eventos abiertos para interes.</p>}
      {agendaLibre.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Modalidad</th>
              <th>Nombre actividad</th>
              <th>Dia y hora</th>
              <th>Duracion</th>
              <th>Preparacion</th>
              <th>Cuenta Zoom a manejar</th>
              <th>Programa</th>
              <th>Encargado</th>
              <th>Link</th>
              <th>Interes</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {agendaLibre.map((item) => {
              const joinUrl = resolveZoomJoinUrl(item.zoomJoinUrl, item.zoomMeetingId);
              const currentInterest = item.intereses[0]?.estadoInteres || "SIN_RESPUESTA";

              return (
                <tr
                  key={item.id}
                  style={isMeetingStartingSoon(item.inicioProgramadoAt) ? { backgroundColor: "#fff6cc" } : undefined}
                >
                  <td>{formatModalidad(item.solicitud.modalidadReunion)}</td>
                  <td>{item.solicitud.titulo}</td>
                  <td>{formatZoomDateTime(item.inicioProgramadoAt)} a {formatZoomDateTime(item.finProgramadoAt)}</td>
                  <td className="mono">{formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)}</td>
                  <td className="mono">{getPreparacionDisplay(item)}</td>
                  <td>{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || ""}</td>
                  <td>{item.solicitud.programaNombre || ""}</td>
                  <td>{getEncargado(item) || item.solicitud.responsableNombre || ""}</td>
                  <td>
                    {joinUrl ? (
                      <a
                        href={joinUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn success"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "6px 10px",
                          borderRadius: 8,
                          fontSize: "0.85rem",
                          lineHeight: 1.1
                        }}
                      >
                        Abrir link
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{currentInterest}</td>
                  <td>
                    <div style={{ display: "inline-flex", gap: 8 }}>
                      <button
                        className={currentInterest === "ME_INTERESA" ? "btn primary" : "btn ghost"}
                        onClick={() => onSetInterest(item.id, "ME_INTERESA")}
                        type="button"
                        disabled={updatingInterestId === item.id}
                      >
                        Me interesa
                      </button>
                      <button
                        className={currentInterest === "NO_ME_INTERESA" ? "btn primary" : "btn ghost"}
                        onClick={() => onSetInterest(item.id, "NO_ME_INTERESA")}
                        type="button"
                        disabled={updatingInterestId === item.id}
                      >
                        No me interesa
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
}
