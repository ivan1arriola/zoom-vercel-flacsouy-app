import type { DashboardSummary } from "@/src/services/dashboardApi";

interface SpaTabDashboardProps {
  summary: DashboardSummary | null;
}

export function SpaTabDashboard({ summary }: SpaTabDashboardProps) {
  if (!summary) return null;

  return (
    <div className="grid">
      <article className="card">
        <h3 style={{ marginTop: 0 }}>Solicitudes</h3>
        <p>
          <strong>Total:</strong> {summary.solicitudesTotales}
        </p>
      </article>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>Pendientes manuales</h3>
        <p>
          <strong>Casos:</strong> {summary.manualPendings}
        </p>
      </article>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>Cobertura soporte</h3>
        <p>
          <strong>Sin asignar:</strong> {summary.eventosSinSoporte}
        </p>
      </article>
      <article className="card">
        <h3 style={{ marginTop: 0 }}>Agenda abierta</h3>
        <p>
          <strong>Eventos:</strong> {summary.agendaAbierta}
        </p>
      </article>
    </div>
  );
}
