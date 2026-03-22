"use client";

import { FormEvent } from "react";
import { ToggleButtons } from "@/components/toggle-buttons";
import {
  formatDateTime,
  parseWeekdaysCsv,
  zoomMonthlyWeekOptions,
  zoomWeekdayOptions,
  type ZoomMonthlyMode,
  type ZoomRecurrenceType
} from "@/src/lib/spa-home/recurrence";
import type { Solicitud } from "@/src/services/solicitudesApi";

interface SolicitudForm {
  tema: string;
  responsable: string;
  programa: string;
  asistenciaZoom: string;
  modalidad: string;
  grabacion: string;
  unaOVarias: string;
  controlAsistencia: string;
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
  recurrenciaTipoZoom: string;
  recurrenciaIntervalo: string;
  recurrenciaDiasSemana: string;
  recurrenciaMensualModo: string;
  recurrenciaDiaMes: string;
  recurrenciaSemanaMes: string;
  recurrenciaDiaSemanaMes: string;
  fechaFinal: string;
  correosDocentes: string;
}

interface SpaTabSolicitudesProps {
  solicitudes: Solicitud[];
  form: SolicitudForm;
  updateForm: (key: keyof SolicitudForm, value: string) => void;
  isSubmittingSolicitud: boolean;
  canCreateShortcut: boolean;
  docenteSolicitudesView: "form" | "list";
  setDocenteSolicitudesView: (view: "form" | "list") => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SpaTabSolicitudes({
  solicitudes,
  form,
  updateForm,
  isSubmittingSolicitud,
  canCreateShortcut,
  docenteSolicitudesView,
  setDocenteSolicitudesView,
  onSubmit
}: SpaTabSolicitudesProps) {
  return (
    <article className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Solicitudes de sala</h3>
        {canCreateShortcut && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={docenteSolicitudesView === "list" ? "btn primary" : "btn ghost"}
              onClick={() => setDocenteSolicitudesView("list")}
            >
              Ver solicitudes
            </button>
            <button
              type="button"
              className={docenteSolicitudesView === "form" ? "btn primary" : "btn ghost"}
              onClick={() => setDocenteSolicitudesView("form")}
            >
              Nueva solicitud
            </button>
          </div>
        )}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Listado de solicitudes con estado, solicitante e informacion de reunion.
      </p>

      {canCreateShortcut && docenteSolicitudesView === "form" ? (
        <form onSubmit={onSubmit}>
          <h4 style={{ marginBottom: 8 }}>Seccion 1 de 3 - Datos generales</h4>
          <label style={{ display: "block", marginBottom: 8 }}>
            Tema
            <input
              type="text"
              required
              value={form.tema}
              onChange={(e) => updateForm("tema", e.target.value)}
              placeholder="Nombre del Seminario / Clase / Reunion"
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Nombre de la persona responsable
            <input
              type="text"
              required
              value={form.responsable}
              onChange={(e) => updateForm("responsable", e.target.value)}
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Programa
            <input
              type="text"
              required
              value={form.programa}
              onChange={(e) => updateForm("programa", e.target.value)}
              placeholder="Programa a cargo de la propuesta"
            />
          </label>

          <ToggleButtons
            label="Asistencia Zoom"
            value={form.asistenciaZoom}
            onChange={(val) => updateForm("asistenciaZoom", val)}
          />

          <ToggleButtons
            label="Modalidad"
            name="solicitud-modalidad"
            value={form.modalidad}
            onChange={(val) => updateForm("modalidad", val)}
            options={[
              { value: "VIRTUAL", label: "Virtual" },
              { value: "HIBRIDA", label: "Hibrida" }
            ]}
          />

          <ToggleButtons
            label="Grabacion"
            name="solicitud-grabacion"
            value={form.grabacion}
            onChange={(val) => updateForm("grabacion", val)}
            options={[
              { value: "SI", label: "Si" },
              { value: "NO", label: "No" },
              { value: "DEFINIR", label: "A definir" }
            ]}
          />

          <ToggleButtons
            label="Una o varias reuniones"
            name="solicitud-instancias"
            value={form.unaOVarias}
            onChange={(val) => updateForm("unaOVarias", val)}
            options={[
              { value: "UNA", label: "Una sola" },
              { value: "VARIAS", label: "Varias" }
            ]}
          />

          <ToggleButtons
            label="Control de asistencia"
            value={form.controlAsistencia}
            onChange={(val) => updateForm("controlAsistencia", val)}
          />

          {form.unaOVarias === "UNA" ? (
            <>
              <h4 style={{ marginBottom: 8 }}>Seccion 2 de 3 - Reunion unica</h4>
              <label style={{ display: "block", marginBottom: 8 }}>
                Descripcion (opcional)
                <textarea
                  value={form.descripcionUnica}
                  onChange={(e) => updateForm("descripcionUnica", e.target.value)}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Dia de comienzo
                  <input
                    type="date"
                    required
                    value={form.diaUnica}
                    onChange={(e) => updateForm("diaUnica", e.target.value)}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Hora de comienzo
                  <input
                    type="time"
                    required
                    value={form.horaInicioUnica}
                    onChange={(e) => updateForm("horaInicioUnica", e.target.value)}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Hora de fin
                  <input
                    type="time"
                    value={form.horaFinUnica}
                    onChange={(e) => updateForm("horaFinUnica", e.target.value)}
                    required={!form.duracionUnica}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Duracion (minutos)
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={form.duracionUnica}
                    onChange={(e) => updateForm("duracionUnica", e.target.value)}
                    required={!form.horaFinUnica}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <h4 style={{ marginBottom: 8 }}>Seccion 3 de 3 - Reuniones periodicas</h4>
              <label style={{ display: "block", marginBottom: 8 }}>
                Descripcion (opcional)
                <textarea
                  value={form.descripcionRecurrente}
                  onChange={(e) => updateForm("descripcionRecurrente", e.target.value)}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Primer dia
                  <input
                    type="date"
                    required
                    value={form.primerDiaRecurrente}
                    onChange={(e) => updateForm("primerDiaRecurrente", e.target.value)}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Hora de comienzo
                  <input
                    type="time"
                    required
                    value={form.horaInicioRecurrente}
                    onChange={(e) => updateForm("horaInicioRecurrente", e.target.value)}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Hora de fin
                  <input
                    type="time"
                    value={form.horaFinRecurrente}
                    onChange={(e) => updateForm("horaFinRecurrente", e.target.value)}
                    required={!form.duracionRecurrente}
                  />
                </label>
                <label style={{ display: "block", marginBottom: 8 }}>
                  Duracion (minutos)
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={form.duracionRecurrente}
                    onChange={(e) => updateForm("duracionRecurrente", e.target.value)}
                    required={!form.horaFinRecurrente}
                  />
                </label>
              </div>

              <ToggleButtons
                label="Recurrencia (Zoom)"
                name="solicitud-recurrencia-zoom"
                value={form.recurrenciaTipoZoom}
                onChange={(val) => updateForm("recurrenciaTipoZoom", val as ZoomRecurrenceType)}
                options={[
                  { value: "1", label: "Diaria" },
                  { value: "2", label: "Semanal" },
                  { value: "3", label: "Mensual" }
                ]}
              />

              <label style={{ display: "block", marginBottom: 8 }}>
                Intervalo
                <input
                  type="number"
                  min={1}
                  max={
                    form.recurrenciaTipoZoom === "1" ? 90 : form.recurrenciaTipoZoom === "2" ? 12 : 3
                  }
                  step={1}
                  required
                  value={form.recurrenciaIntervalo}
                  onChange={(e) => updateForm("recurrenciaIntervalo", e.target.value)}
                />
                <small className="muted">
                  {form.recurrenciaTipoZoom === "1" && "Zoom diario: maximo cada 90 dias."}
                  {form.recurrenciaTipoZoom === "2" && "Zoom semanal: maximo cada 12 semanas."}
                  {form.recurrenciaTipoZoom === "3" && "Zoom mensual: maximo cada 3 meses."}
                </small>
              </label>

              {form.recurrenciaTipoZoom === "2" && (
                <fieldset
                  style={{
                    marginBottom: 8,
                    border: "1px solid var(--flacso-border)",
                    borderRadius: 8,
                    padding: 10
                  }}
                >
                  <legend style={{ padding: "0 6px" }}>Dias de la semana</legend>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
                      gap: 8
                    }}
                  >
                    {zoomWeekdayOptions.map((dayOption) => {
                      const checked = parseWeekdaysCsv(form.recurrenciaDiasSemana).includes(Number(dayOption.value));
                      return (
                        <label key={dayOption.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const current = parseWeekdaysCsv(form.recurrenciaDiasSemana);
                              const value = Number(dayOption.value);
                              const next = e.target.checked
                                ? [...new Set([...current, value])]
                                : current.filter((day) => day !== value);
                              updateForm("recurrenciaDiasSemana", next.sort((a, b) => a - b).join(","));
                            }}
                          />
                          {dayOption.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {form.recurrenciaTipoZoom === "3" && (
                <>
                  <ToggleButtons
                    label="Modo mensual"
                    name="solicitud-modo-mensual"
                    value={form.recurrenciaMensualModo}
                    onChange={(val) => updateForm("recurrenciaMensualModo", val as ZoomMonthlyMode)}
                    options={[
                      { value: "DAY_OF_MONTH", label: "Dia del mes" },
                      { value: "WEEKDAY_OF_MONTH", label: "Dia de semana" }
                    ]}
                  />
                  {form.recurrenciaMensualModo === "DAY_OF_MONTH" ? (
                    <label style={{ display: "block", marginBottom: 8 }}>
                      Dia del mes (1-31)
                      <input
                        type="number"
                        min={1}
                        max={31}
                        step={1}
                        required
                        value={form.recurrenciaDiaMes}
                        onChange={(e) => updateForm("recurrenciaDiaMes", e.target.value)}
                      />
                    </label>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Semana del mes
                        <select
                          value={form.recurrenciaSemanaMes}
                          onChange={(e) => updateForm("recurrenciaSemanaMes", e.target.value)}
                        >
                          {zoomMonthlyWeekOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "block", marginBottom: 8 }}>
                        Dia de semana
                        <select
                          value={form.recurrenciaDiaSemanaMes}
                          onChange={(e) => updateForm("recurrenciaDiaSemanaMes", e.target.value)}
                        >
                          {zoomWeekdayOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </>
              )}

              <label style={{ display: "block", marginBottom: 8 }}>
                Fecha final
                <input
                  type="date"
                  required
                  value={form.fechaFinal}
                  onChange={(e) => updateForm("fechaFinal", e.target.value)}
                />
              </label>
            </>
          )}

          <label style={{ display: "block", marginBottom: 8 }}>
            Correos de docentes
            <textarea
              value={form.correosDocentes}
              onChange={(e) => updateForm("correosDocentes", e.target.value)}
              placeholder="web@flacso.edu.uy; noreply@flacso.edu.uy"
            />
          </label>

          <button className="btn primary" type="submit" disabled={isSubmittingSolicitud}>
            {isSubmittingSolicitud ? "Enviando solicitud..." : "Enviar solicitud"}
          </button>
        </form>
      ) : null}

      {(docenteSolicitudesView === "list" || !canCreateShortcut) && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Listado de solicitudes</h4>
          {solicitudes.length === 0 && <p className="muted">No hay solicitudes registradas.</p>}
          {solicitudes.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Titulo</th>
                  <th>Solicitado por</th>
                  <th>Modalidad</th>
                  <th>Estado</th>
                  <th>ID de reunion</th>
                  <th>Cuenta Zoom</th>
                  <th>Link</th>
                  <th>Instancias</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {solicitudes.map((item) => {
                  const joinUrl = item.zoomJoinUrl ?? item.zoomInstances?.find((instance) => instance.joinUrl)?.joinUrl ?? null;
                  const instanceCount = item.zoomInstanceCount ?? item.zoomInstances?.length ?? 1;
                  const accountLabel = item.cuentaZoomAsignada?.ownerEmail || item.cuentaZoomAsignada?.nombreCuenta || "-";
                  const requesterLabel = item.requestedBy?.name || item.requestedBy?.email || "-";
                  const meetingIdDisplay =
                    item.estadoSolicitud === "PENDIENTE_RESOLUCION_MANUAL_ID"
                      ? "Pendiente"
                      : item.meetingPrincipalId || "-";

                  return (
                    <tr key={item.id}>
                      <td>{item.titulo}</td>
                      <td>{requesterLabel}</td>
                      <td>{item.modalidadReunion}</td>
                      <td>{item.estadoSolicitud}</td>
                      <td className="mono">{meetingIdDisplay}</td>
                      <td>{accountLabel}</td>
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
                      <td className="mono">{instanceCount}</td>
                      <td>
                        {item.zoomInstances && item.zoomInstances.length > 1 ? (
                          <details>
                            <summary>Ver dias</summary>
                            <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                              {item.zoomInstances.map((instance, index) => (
                                <span key={`${item.id}-inst-${index}`}>
                                  {index + 1}. {formatDateTime(instance.startTime)}
                                </span>
                              ))}
                            </div>
                          </details>
                        ) : item.zoomInstances && item.zoomInstances.length === 1 ? (
                          <span>{formatDateTime(item.zoomInstances[0].startTime)}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </article>
  );
}
