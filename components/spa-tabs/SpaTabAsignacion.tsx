"use client";

import { formatDuration } from "@/src/lib/spa-home/recurrence";
import { formatModalidad, formatZoomDateTime } from "./spa-tabs-utils";
import type { AssignmentBoardEvent, AssignableAssistant } from "@/src/services/dashboardApi";

interface SpaTabAsignacionProps {
  assignmentBoardEvents: AssignmentBoardEvent[];
  assignableAssistants: AssignableAssistant[];
  isLoadingAssignmentBoard: boolean;
  assigningEventId: string | null;
  selectedAssistantByEvent: Record<string, string>;
  onSelectedAssistantChange: (eventId: string, assistantId: string) => void;
  onAssignAssistant: (eventId: string) => void;
}

export function SpaTabAsignacion({
  assignmentBoardEvents,
  assignableAssistants,
  isLoadingAssignmentBoard,
  assigningEventId,
  selectedAssistantByEvent,
  onSelectedAssistantChange,
  onAssignAssistant
}: SpaTabAsignacionProps) {
  return (
    <article className="card">
      <h3 style={{ marginTop: 0 }}>Asignacion de Personal</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Vista exclusiva para administracion: instancias abiertas, personas interesadas y asignacion final.
      </p>
      <p className="muted" style={{ marginTop: 0 }}>
        La asignacion valida choques de horario y exige un margen minimo de 30 minutos entre reuniones.
      </p>
      {isLoadingAssignmentBoard && <p className="muted">Cargando panel de asignacion...</p>}
      {!isLoadingAssignmentBoard && assignmentBoardEvents.length === 0 && (
        <p className="muted">No hay instancias pendientes de asignacion.</p>
      )}
      {!isLoadingAssignmentBoard && assignmentBoardEvents.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Modalidad</th>
              <th>Nombre actividad</th>
              <th>Dia y hora</th>
              <th>Duracion</th>
              <th>Cuenta Zoom</th>
              <th>Programa</th>
              <th>Interesados</th>
              <th>Asignar persona</th>
              <th>Accion</th>
            </tr>
          </thead>
          <tbody>
            {assignmentBoardEvents.map((item) => {
              const interestedIds = new Set(item.interesados.map((interest) => interest.asistenteZoomId));
              const options = [
                ...item.interesados.map((interest) => ({
                  id: interest.asistenteZoomId,
                  label: `${interest.nombre} (${interest.email})`
                })),
                ...assignableAssistants
                  .filter((assistant) => !interestedIds.has(assistant.id))
                  .map((assistant) => ({
                    id: assistant.id,
                    label: `${assistant.nombre} (${assistant.email})`
                  }))
              ];

              return (
                <tr key={item.id}>
                  <td>{formatModalidad(item.modalidadReunion)}</td>
                  <td>{item.solicitud.titulo}</td>
                  <td>{formatZoomDateTime(item.inicioProgramadoAt)} a {formatZoomDateTime(item.finProgramadoAt)}</td>
                  <td className="mono">{formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)}</td>
                  <td>{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || "-"}</td>
                  <td>{item.solicitud.programaNombre || "-"}</td>
                  <td>
                    {item.interesados.length > 0
                      ? item.interesados.map((interest) => `${interest.nombre} (${interest.email})`).join(", ")
                      : "Sin interesados"}
                  </td>
                  <td>
                    <select
                      value={selectedAssistantByEvent[item.id] ?? ""}
                      onChange={(e) => onSelectedAssistantChange(item.id, e.target.value)}
                      style={{ minWidth: 220 }}
                    >
                      <option value="">Seleccionar</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => onAssignAssistant(item.id)}
                      disabled={assigningEventId === item.id || !selectedAssistantByEvent[item.id]}
                    >
                      {assigningEventId === item.id ? "Asignando..." : "Asignar"}
                    </button>
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
