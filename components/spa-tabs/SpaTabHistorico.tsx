"use client";

import { FormEvent } from "react";
import { formatDateTime } from "@/src/lib/spa-home/recurrence";
import type { PastMeeting } from "@/src/services/solicitudesApi";

interface PastMeetingForm {
  titulo: string;
  modalidadReunion: string;
  docenteEmail: string;
  monitorEmail: string;
  zoomMeetingId: string;
  inicioRealAt: string;
  finRealAt: string;
  programaNombre: string;
  responsableNombre: string;
  zoomJoinUrl: string;
  descripcion: string;
}

interface SpaTabHistoricoProps {
  pastMeetings: PastMeeting[];
  isLoadingPastMeetings: boolean;
  onRefreshPastMeetings: () => void;
  pastMeetingForm: PastMeetingForm;
  setPastMeetingForm: (form: PastMeetingForm | ((prev: PastMeetingForm) => PastMeetingForm)) => void;
  isSubmittingPastMeeting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SpaTabHistorico({
  pastMeetings,
  isLoadingPastMeetings,
  onRefreshPastMeetings,
  pastMeetingForm,
  setPastMeetingForm,
  isSubmittingPastMeeting,
  onSubmit
}: SpaTabHistoricoProps) {
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Reuniones pasadas</h3>
        <button
          type="button"
          className="btn ghost"
          onClick={onRefreshPastMeetings}
          disabled={isLoadingPastMeetings}
        >
          {isLoadingPastMeetings ? "Actualizando..." : "Actualizar lista"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Historial de reuniones finalizadas con Meeting ID de Zoom.
      </p>

      {isLoadingPastMeetings && <p className="muted">Cargando reuniones pasadas...</p>}

      {!isLoadingPastMeetings && pastMeetings.length === 0 && (
        <p className="muted">No hay reuniones pasadas registradas.</p>
      )}

      {!isLoadingPastMeetings && pastMeetings.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Titulo</th>
              <th>ID Zoom</th>
              <th>Docente</th>
              <th>Monitoreo</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Duracion</th>
              <th>Modalidad</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {pastMeetings.map((meeting) => (
              <tr key={meeting.id}>
                <td>{meeting.titulo}</td>
                <td className="mono">{meeting.zoomMeetingId}</td>
                <td>{meeting.docenteNombre || meeting.docenteEmail}</td>
                <td>{meeting.monitorNombre || meeting.monitorEmail || "-"}</td>
                <td>{formatDateTime(meeting.inicioAt)}</td>
                <td>{formatDateTime(meeting.finAt)}</td>
                <td className="mono">{meeting.minutosReales} min</td>
                <td>{meeting.modalidadReunion}</td>
                <td>
                  {meeting.zoomJoinUrl ? (
                    <a
                      href={meeting.zoomJoinUrl}
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
                      Abrir
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--border)" }} />

      <h3 style={{ marginTop: 0 }}>Registrar reunion pasada</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Este registro exige un Meeting ID de Zoom con instancias ya pasadas y crea la solicitud base para liquidacion.
      </p>
      <form onSubmit={onSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <label style={{ display: "block" }}>
            Titulo
            <input
              type="text"
              required
              value={pastMeetingForm.titulo}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, titulo: e.target.value }))}
              placeholder="Nombre de actividad"
            />
          </label>
          <label style={{ display: "block" }}>
            Modalidad
            <select
              value={pastMeetingForm.modalidadReunion}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, modalidadReunion: e.target.value }))}
            >
              <option value="VIRTUAL">Virtual</option>
              <option value="HIBRIDA">Hibrida</option>
            </select>
          </label>
          <label style={{ display: "block" }}>
            Email docente
            <input
              type="email"
              required
              value={pastMeetingForm.docenteEmail}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, docenteEmail: e.target.value }))}
              placeholder="docente@dominio.com"
            />
          </label>
          <label style={{ display: "block" }}>
            Email monitoreo (opcional)
            <input
              type="email"
              value={pastMeetingForm.monitorEmail}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, monitorEmail: e.target.value }))}
              placeholder="monitor@dominio.com"
            />
          </label>
          <label style={{ display: "block" }}>
            Zoom Meeting ID
            <input
              type="text"
              value={pastMeetingForm.zoomMeetingId}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, zoomMeetingId: e.target.value }))}
              placeholder="12345678901"
            />
          </label>
          <label style={{ display: "block" }}>
            Inicio real
            <input
              type="datetime-local"
              required
              value={pastMeetingForm.inicioRealAt}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, inicioRealAt: e.target.value }))}
            />
          </label>
          <label style={{ display: "block" }}>
            Fin real
            <input
              type="datetime-local"
              required
              value={pastMeetingForm.finRealAt}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, finRealAt: e.target.value }))}
            />
          </label>
          <label style={{ display: "block" }}>
            Programa (opcional)
            <input
              type="text"
              value={pastMeetingForm.programaNombre}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, programaNombre: e.target.value }))}
            />
          </label>
          <label style={{ display: "block" }}>
            Responsable (opcional)
            <input
              type="text"
              value={pastMeetingForm.responsableNombre}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, responsableNombre: e.target.value }))}
            />
          </label>
        </div>
        <label style={{ display: "block", marginTop: 10 }}>
          Link de Zoom (opcional)
          <input
            type="url"
            value={pastMeetingForm.zoomJoinUrl}
            onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, zoomJoinUrl: e.target.value }))}
            placeholder="https://zoom.us/j/..."
          />
        </label>
        <label style={{ display: "block", marginTop: 10 }}>
          Descripcion (opcional)
          <textarea
            value={pastMeetingForm.descripcion}
            onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, descripcion: e.target.value }))}
            placeholder="Contexto del registro manual"
          />
        </label>
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" type="submit" disabled={isSubmittingPastMeeting}>
            {isSubmittingPastMeeting ? "Registrando..." : "Registrar reunion pasada"}
          </button>
        </div>
      </form>
    </article>
  );
}
