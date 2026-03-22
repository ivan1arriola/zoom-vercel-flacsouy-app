"use client";

import { Fragment } from "react";
import { isLicensedZoomAccount, isMeetingStartingSoon, formatZoomDateTime, formatDurationHoursMinutes } from "./spa-tabs-utils";
import type { ZoomAccount } from "@/src/services/zoomApi";

interface SpaTabCuentasProps {
  zoomAccounts: ZoomAccount[];
  zoomGroupName: string;
  isLoadingZoomAccounts: boolean;
  expandedZoomAccountId: string | null;
  setExpandedZoomAccountId: (id: string | null) => void;
  onRefresh: () => void;
}

export function SpaTabCuentas({
  zoomAccounts,
  zoomGroupName,
  isLoadingZoomAccounts,
  expandedZoomAccountId,
  setExpandedZoomAccountId,
  onRefresh
}: SpaTabCuentasProps) {
  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Cuentas Zoom disponibles</h3>
        <button className="btn ghost" onClick={onRefresh} type="button" disabled={isLoadingZoomAccounts}>
          {isLoadingZoomAccounts ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Grupo: {zoomGroupName || "(sin nombre)"}
      </p>
      {isLoadingZoomAccounts && <p className="muted">Cargando cuentas...</p>}
      {!isLoadingZoomAccounts && zoomAccounts.length === 0 && (
        <p className="muted">No hay cuentas disponibles en el grupo.</p>
      )}
      {!isLoadingZoomAccounts && zoomAccounts.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Eventos pendientes (Zoom)</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {zoomAccounts.map((account) => (
              <Fragment key={account.id}>
                <tr>
                  <td>{account.email || "-"}</td>
                  <td>
                    {[account.firstName, account.lastName].filter(Boolean).join(" ") || "-"}
                    {isLicensedZoomAccount(account) ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: "0.72rem",
                          fontWeight: 800,
                          color: "var(--flacso-btn)"
                        }}
                        title="Cuenta con licencia"
                      >
                        L
                      </span>
                    ) : null}
                  </td>
                  <td>{account.pendingEventsCount}</td>
                  <td>
                    {account.pendingEventsCount > 0 ? (
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          setExpandedZoomAccountId(expandedZoomAccountId === account.id ? null : account.id)
                        }
                      >
                        {expandedZoomAccountId === account.id ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
                {expandedZoomAccountId === account.id && account.pendingEventsCount > 0 && (
                  <tr>
                    <td colSpan={4}>
                      <div style={{ padding: "8px 0" }}>
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Tema</th>
                              <th>Inicio</th>
                              <th>Duracion (HH:mm)</th>
                              <th>Link</th>
                            </tr>
                          </thead>
                          <tbody>
                            {account.pendingEvents.map((event, index) => (
                              <tr
                                key={event.id}
                                style={
                                  isMeetingStartingSoon(event.startTime)
                                    ? { backgroundColor: "#fff6cc" }
                                    : undefined
                                }
                              >
                                <td className="mono">#{index + 1}</td>
                                <td>{event.topic}</td>
                                <td>{formatZoomDateTime(event.startTime)}</td>
                                <td>{formatDurationHoursMinutes(event.durationMinutes)}</td>
                                <td>
                                  {event.joinUrl ? (
                                    <a
                                      href={event.joinUrl}
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
