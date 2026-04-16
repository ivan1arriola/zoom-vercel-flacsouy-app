export type AssistantStatsRow = {
  asistenteZoomId: string;
  usuarioId: string;
  nombre: string;
  email: string;
  role: string;
  postuladas: number;
  asignadas: number;
  ratio: number;
  postuladasMesActual: number;
  asignadasMesActual: number;
  ratioMesActual: number;
  notificaciones: {
    total: number;
    enviadas: number;
    fallidas: number;
    pendientes: number;
  };
};

export type AdminStatsResponse = {
  generatedAt: string;
  assistants: AssistantStatsRow[];
  notifications: {
    total: number;
    last7Days: number;
    byEstado: {
      PENDIENTE: number;
      ENVIADA: number;
      FALLIDA: number;
    };
    byTipo: {
      EMAIL: number;
      IN_APP: number;
      ALERTA_OPERATIVA: number;
    };
  };
};

export async function loadAdminStats(): Promise<AdminStatsResponse | null> {
  const response = await fetch("/api/v1/estadisticas", { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as AdminStatsResponse;
  return payload;
}
