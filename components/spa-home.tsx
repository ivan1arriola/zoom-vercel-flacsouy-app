"use client";

import { useEffect, useMemo, useState } from "react";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
};

type DashboardSummary = {
  solicitudesTotales: number;
  manualPendings: number;
  eventosSinSoporte: number;
  agendaAbierta: number;
};

type Solicitud = {
  id: string;
  titulo: string;
  modalidadReunion: string;
  tipoInstancias: string;
  estadoSolicitud: string;
  requiresAsistencia?: boolean;
  meetingPrincipalId?: string | null;
  createdAt: string;
};

type AgendaEvent = {
  id: string;
  inicioProgramadoAt: string;
  solicitud: {
    titulo: string;
    modalidadReunion: string;
  };
  intereses: Array<{
    id: string;
    estadoInteres: string;
  }>;
};

const tabs = ["dashboard", "solicitudes", "agenda", "manual", "tarifas"] as const;
type Tab = (typeof tabs)[number];

export function SpaHome() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [manualPendings, setManualPendings] = useState<Array<{ id: string; titulo: string }>>([]);
  const [tarifas, setTarifas] = useState<Array<{ id: string; modalidadReunion: string; valorHora: string; moneda: string }>>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canSeeManual = useMemo(() => user?.role === "ADMINISTRADOR", [user]);
  const canSeeAgenda = useMemo(
    () => ["ASISTENTE_ZOOM", "SOPORTE_ZOOM", "ADMINISTRADOR"].includes(user?.role ?? ""),
    [user]
  );
  const canSeeTarifas = useMemo(
    () => ["CONTADURIA", "ADMINISTRADOR"].includes(user?.role ?? ""),
    [user]
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const meRes = await fetch("/api/v1/auth/me");
      const meJson = (await meRes.json()) as { user?: CurrentUser; error?: string };
      if (!meRes.ok || !meJson.user) {
        setMessage(meJson.error ?? "No autenticado.");
        return;
      }
      setUser(meJson.user);

      await Promise.all([
        loadSummary(),
        loadSolicitudes(),
        loadAgenda(),
        loadManualPendings(),
        loadTarifas()
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    const res = await fetch("/api/v1/dashboard");
    if (!res.ok) return;
    const json = (await res.json()) as { summary: DashboardSummary };
    setSummary(json.summary);
  }

  async function loadSolicitudes() {
    const res = await fetch("/api/v1/solicitudes-sala");
    if (!res.ok) return;
    const json = (await res.json()) as { requests: Solicitud[] };
    setSolicitudes(json.requests);
  }

  async function loadAgenda() {
    const res = await fetch("/api/v1/agenda-soporte/abierta");
    if (!res.ok) return;
    const json = (await res.json()) as { agenda: AgendaEvent[] };
    setAgenda(json.agenda);
  }

  async function loadManualPendings() {
    const res = await fetch("/api/v1/provision-manual/pendientes");
    if (!res.ok) return;
    const json = (await res.json()) as { pendings: Array<{ id: string; titulo: string }> };
    setManualPendings(json.pendings);
  }

  async function loadTarifas() {
    const res = await fetch("/api/v1/tarifas-asistencia");
    if (!res.ok) return;
    const json = (await res.json()) as {
      rates: Array<{ id: string; modalidadReunion: string; valorHora: string; moneda: string }>;
    };
    setTarifas(json.rates);
  }

  async function createDemoRequest() {
    setMessage("");
    const response = await fetch("/api/v1/solicitudes-sala", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: "Clase demostración PWA",
        modalidadReunion: "VIRTUAL",
        tipoInstancias: "UNICA",
        fechaInicioSolicitada: new Date(Date.now() + 48 * 60 * 60000).toISOString(),
        fechaFinSolicitada: new Date(Date.now() + 49 * 60 * 60000).toISOString(),
        timezone: "America/Montevideo",
        requiereAsistencia: true,
        motivoAsistencia: "Acompañamiento de soporte"
      })
    });
    const data = (await response.json()) as { error?: string; request?: { id: string } };
    if (!response.ok) {
      setMessage(data.error ?? "No se pudo crear solicitud demo.");
      return;
    }
    setMessage(`Solicitud creada: ${data.request?.id}`);
    await Promise.all([loadSolicitudes(), loadSummary(), loadAgenda(), loadManualPendings()]);
  }

  async function setInterest(eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA") {
    const response = await fetch(`/api/v1/eventos-zoom/${eventoId}/intereses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estadoInteres })
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "No se pudo registrar interés.");
      return;
    }
    setMessage("Interés actualizado.");
    await loadAgenda();
  }

  return (
    <section>
      <h1 className="title">Gestión Institucional de Salas Zoom</h1>
      <p className="muted">
        Experiencia SPA inicial del nuevo sistema (solicitudes, soporte, provisión manual y tarifas).
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button className="btn ghost" onClick={() => setTab("dashboard")} type="button">
          Dashboard
        </button>
        <button className="btn ghost" onClick={() => setTab("solicitudes")} type="button">
          Solicitudes
        </button>
        {canSeeAgenda && (
          <button className="btn ghost" onClick={() => setTab("agenda")} type="button">
            Agenda soporte
          </button>
        )}
        {canSeeManual && (
          <button className="btn ghost" onClick={() => setTab("manual")} type="button">
            Resolución manual
          </button>
        )}
        {canSeeTarifas && (
          <button className="btn ghost" onClick={() => setTab("tarifas")} type="button">
            Tarifas
          </button>
        )}
      </div>

      {loading && <p className="muted">Cargando...</p>}

      {tab === "dashboard" && summary && (
        <div className="grid">
          <article className="card">
            <h3 style={{ marginTop: 0 }}>Solicitudes</h3>
            <p><strong>Total:</strong> {summary.solicitudesTotales}</p>
          </article>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>Pendientes manuales</h3>
            <p><strong>Casos:</strong> {summary.manualPendings}</p>
          </article>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>Cobertura soporte</h3>
            <p><strong>Sin asignar:</strong> {summary.eventosSinSoporte}</p>
          </article>
          <article className="card">
            <h3 style={{ marginTop: 0 }}>Agenda abierta</h3>
            <p><strong>Eventos:</strong> {summary.agendaAbierta}</p>
          </article>
        </div>
      )}

      {tab === "solicitudes" && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>Solicitudes de sala</h3>
          <p className="muted">Usuario actual: {user?.email} ({user?.role})</p>
          <button className="btn primary" type="button" onClick={createDemoRequest}>
            Crear solicitud demo
          </button>
          <div style={{ marginTop: 12 }}>
            {solicitudes.length === 0 && <p className="muted">No hay solicitudes registradas.</p>}
            {solicitudes.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Título</th>
                    <th>Modalidad</th>
                    <th>Instancias</th>
                    <th>Estado</th>
                    <th>Meeting ID</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map((item) => (
                    <tr key={item.id}>
                      <td className="mono">{item.id}</td>
                      <td>{item.titulo}</td>
                      <td>{item.modalidadReunion}</td>
                      <td>{item.tipoInstancias}</td>
                      <td>{item.estadoSolicitud}</td>
                      <td className="mono">{item.meetingPrincipalId || "(manual pendiente)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </article>
      )}

      {tab === "agenda" && canSeeAgenda && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>Agenda abierta de soporte</h3>
          {agenda.length === 0 && <p className="muted">No hay eventos abiertos para interés.</p>}
          {agenda.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Inicio</th>
                  <th>Modalidad</th>
                  <th>Interés actual</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {agenda.map((item) => (
                  <tr key={item.id}>
                    <td>{item.solicitud.titulo}</td>
                    <td className="mono">{new Date(item.inicioProgramadoAt).toISOString()}</td>
                    <td>{item.solicitud.modalidadReunion}</td>
                    <td>{item.intereses[0]?.estadoInteres || "SIN_RESPUESTA"}</td>
                    <td>
                      <button
                        className="btn ghost"
                        onClick={() => setInterest(item.id, "ME_INTERESA")}
                        type="button"
                      >
                        Me interesa
                      </button>
                      <button
                        className="btn ghost"
                        style={{ marginLeft: 8 }}
                        onClick={() => setInterest(item.id, "NO_ME_INTERESA")}
                        type="button"
                      >
                        No me interesa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}

      {tab === "manual" && canSeeManual && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>Pendientes de resolución manual</h3>
          {manualPendings.length === 0 && <p className="muted">No hay pendientes manuales.</p>}
          {manualPendings.length > 0 && (
            <ul>
              {manualPendings.map((item) => (
                <li key={item.id}>
                  {item.id} - {item.titulo}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {tab === "tarifas" && canSeeTarifas && (
        <article className="card">
          <h3 style={{ marginTop: 0 }}>Tarifas por modalidad</h3>
          {tarifas.length === 0 && <p className="muted">No hay tarifas registradas.</p>}
          {tarifas.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Modalidad</th>
                  <th>Valor hora</th>
                  <th>Moneda</th>
                </tr>
              </thead>
              <tbody>
                {tarifas.map((rate) => (
                  <tr key={rate.id}>
                    <td>{rate.modalidadReunion}</td>
                    <td>{rate.valorHora}</td>
                    <td>{rate.moneda}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      )}

      {message && (
        <p className="muted" style={{ marginTop: 14 }}>
          {message}
        </p>
      )}
    </section>
  );
}
