export type ZoomAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  type: number | null;
  status: string;
  pendingEventsCount: number;
  pendingEvents: Array<{
    id: string;
    topic: string;
    startTime: string;
    durationMinutes: number;
    timezone: string;
    joinUrl: string;
    status: string;
  }>;
};

export async function loadZoomAccounts(): Promise<{
  accounts: ZoomAccount[];
  groupName: string;
  error?: string;
}> {
  const res = await fetch("/api/v1/zoom/cuentas-disponibles", { cache: "no-store" });
  const json = (await res.json()) as {
    error?: string;
    groupName?: string;
    accounts?: ZoomAccount[];
  };
  if (!res.ok) {
    return {
      accounts: [],
      groupName: "",
      error: json.error ?? "No se pudieron cargar las cuentas Zoom."
    };
  }

  const normalizedAccounts = (json.accounts ?? [])
    .map((account) => ({
      ...account,
      pendingEvents: [...account.pendingEvents].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
    }))
    .sort((a, b) =>
      (a.email || "").localeCompare(b.email || "", "es", { sensitivity: "base" })
    );

  return {
    accounts: normalizedAccounts,
    groupName: json.groupName ?? "",
    error: undefined
  };
}

export async function loadManualPendings(): Promise<
  Array<{ id: string; titulo: string }> | null
> {
  const res = await fetch("/api/v1/provision-manual/pendientes", { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json()) as { pendings: Array<{ id: string; titulo: string }> };
  return json.pendings;
}
