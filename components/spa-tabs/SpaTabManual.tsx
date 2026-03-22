interface ManualPending {
  id: string;
  titulo: string;
}

interface SpaTabManualProps {
  manualPendings: ManualPending[];
}

export function SpaTabManual({ manualPendings }: SpaTabManualProps) {
  return (
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
  );
}
