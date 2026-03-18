"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { UserAvatar } from "@/components/user-avatar";
import { ToggleButtons } from "@/components/toggle-buttons";

type CurrentUser = {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
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
  finProgramadoAt: string;
  zoomJoinUrl?: string | null;
  cuentaZoom?: {
    nombreCuenta?: string | null;
    ownerEmail?: string | null;
  } | null;
  solicitud: {
    titulo: string;
    modalidadReunion: string;
    programaNombre?: string | null;
    responsableNombre?: string | null;
    patronRecurrencia?: Record<string, unknown> | null;
    docente?: {
      usuario?: {
        email?: string | null;
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
      } | null;
    } | null;
  };
  asignaciones?: Array<{
    asistente?: {
      usuario?: {
        name?: string | null;
        firstName?: string | null;
        lastName?: string | null;
        email?: string | null;
      } | null;
    } | null;
  }>;
  intereses: Array<{
    id: string;
    estadoInteres: string;
  }>;
};

const tabs = ["dashboard", "solicitudes", "agenda", "manual", "cuentas", "tarifas", "perfil"] as const;
type Tab = (typeof tabs)[number];

type ZoomAccount = {
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

function normalizeSupportRole(role: string): string {
  if (role === "ASISTENTE_ZOOM" || role === "SOPORTE_ZOOM") {
    return "SOPORTE_ZOOM";
  }
  return role;
}

export function SpaHome() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [docenteSolicitudesView, setDocenteSolicitudesView] = useState<"form" | "list">("form");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [agenda, setAgenda] = useState<AgendaEvent[]>([]);
  const [manualPendings, setManualPendings] = useState<Array<{ id: string; titulo: string }>>([]);
  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccount[]>([]);
  const [zoomGroupName, setZoomGroupName] = useState("");
  const [isLoadingZoomAccounts, setIsLoadingZoomAccounts] = useState(false);
  const [expandedZoomAccountId, setExpandedZoomAccountId] = useState<string | null>(null);
  const [tarifas, setTarifas] = useState<Array<{ id: string; modalidadReunion: string; valorHora: string; moneda: string }>>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingInterestId, setUpdatingInterestId] = useState<string | null>(null);
  const [isSubmittingSolicitud, setIsSubmittingSolicitud] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isLoadingGoogleStatus, setIsLoadingGoogleStatus] = useState(false);
  const [isSyncingGoogleProfile, setIsSyncingGoogleProfile] = useState(false);
  const [isUnlinkingGoogleAccount, setIsUnlinkingGoogleAccount] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    image: ""
  });
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [form, setForm] = useState({
    tema: "",
    responsable: "",
    programa: "",
    asistenciaZoom: "SI",
    modalidad: "VIRTUAL",
    grabacion: "NO",
    unaOVarias: "UNA",
    controlAsistencia: "NO",
    descripcionUnica: "",
    fechaUnica: "",
    duracionUnica: "60",
    descripcionRecurrente: "",
    primeraFecha: "",
    duracionRecurrente: "60",
    frecuenciaRecurrente: "SEMANAL",
    regimenEncuentros: "",
    fechaFinal: "",
    correosDocentes: ""
  });

  const adminViewRole = useMemo(() => {
    const rawRole = normalizeSupportRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
    const allowedRoles = ["ADMINISTRADOR", "DOCENTE", "SOPORTE_ZOOM", "CONTADURIA"];
    return allowedRoles.includes(rawRole) ? rawRole : "ADMINISTRADOR";
  }, [searchParams]);

  const effectiveRole = useMemo(() => {
    if (!user?.role) return "";
    if (user.role !== "ADMINISTRADOR") return normalizeSupportRole(user.role);
    return adminViewRole;
  }, [user, adminViewRole]);

  const canSeeManual = useMemo(() => effectiveRole === "ADMINISTRADOR", [effectiveRole]);
  const canSeeZoomAccounts = useMemo(() => effectiveRole === "ADMINISTRADOR", [effectiveRole]);
  const canSeeAgenda = useMemo(() => ["SOPORTE_ZOOM", "ADMINISTRADOR"].includes(effectiveRole), [effectiveRole]);
  const canSeeTarifas = useMemo(
    () => ["CONTADURIA", "ADMINISTRADOR"].includes(effectiveRole),
    [effectiveRole]
  );
  const isDocente = useMemo(() => effectiveRole === "DOCENTE", [effectiveRole]);
  const isAssistantRole = useMemo(() => effectiveRole === "SOPORTE_ZOOM", [effectiveRole]);
  const requestedTab = useMemo(() => {
    const rawTab = (searchParams.get("tab") ?? "").toLowerCase();
    if (!rawTab) return null;
    return tabs.includes(rawTab as Tab) ? (rawTab as Tab) : null;
  }, [searchParams]);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const meRes = await fetch("/api/v1/auth/me", { cache: "no-store" });
      const meJson = (await meRes.json()) as { user?: CurrentUser; error?: string };
      if (!meRes.ok || !meJson.user) {
        setMessage(meJson.error ?? "No autenticado.");
        return;
      }
      setUser(meJson.user);
      setProfileForm({
        firstName: meJson.user.firstName ?? "",
        lastName: meJson.user.lastName ?? "",
        image: meJson.user.image ?? ""
      });
      if (meJson.user.role === "DOCENTE") {
        setTab("solicitudes");
      }

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

  useEffect(() => {
    if (!effectiveRole) return;
    if (tab === "agenda" && !canSeeAgenda) {
      setTab("dashboard");
      return;
    }
    if (tab === "manual" && !canSeeManual) {
      setTab("dashboard");
      return;
    }
    if (tab === "cuentas" && !canSeeZoomAccounts) {
      setTab("dashboard");
      return;
    }
    if (tab === "tarifas" && !canSeeTarifas) {
      setTab("dashboard");
    }
  }, [effectiveRole, tab, canSeeAgenda, canSeeManual, canSeeZoomAccounts, canSeeTarifas]);

  useEffect(() => {
    if (tab !== "perfil" || !user) return;
    void loadGoogleAccountStatus();
  }, [tab, user?.id]);

  useEffect(() => {
    if (tab !== "cuentas" || !canSeeZoomAccounts) return;
    void loadZoomAccounts();
  }, [tab, canSeeZoomAccounts]);

  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
  }, [requestedTab]);

  async function loadSummary() {
    const res = await fetch("/api/v1/dashboard", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { summary: DashboardSummary };
    setSummary(json.summary);
  }

  async function loadSolicitudes() {
    const res = await fetch("/api/v1/solicitudes-sala", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { requests: Solicitud[] };
    setSolicitudes(json.requests);
  }

  async function loadAgenda() {
    const res = await fetch("/api/v1/agenda-soporte/abierta", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { agenda: AgendaEvent[] };
    setAgenda(json.agenda);
  }

  async function loadManualPendings() {
    const res = await fetch("/api/v1/provision-manual/pendientes", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { pendings: Array<{ id: string; titulo: string }> };
    setManualPendings(json.pendings);
  }

  async function loadTarifas() {
    const res = await fetch("/api/v1/tarifas-asistencia", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as {
      rates: Array<{ id: string; modalidadReunion: string; valorHora: string; moneda: string }>;
    };
    setTarifas(json.rates);
  }

  async function loadZoomAccounts() {
    setIsLoadingZoomAccounts(true);
    try {
      const res = await fetch("/api/v1/zoom/cuentas-disponibles", { cache: "no-store" });
      const json = (await res.json()) as {
        error?: string;
        groupName?: string;
        accounts?: ZoomAccount[];
      };
      if (!res.ok) {
        setMessage(json.error ?? "No se pudieron cargar las cuentas Zoom.");
        return;
      }
      setZoomGroupName(json.groupName ?? "");
      setZoomAccounts(json.accounts ?? []);
    } finally {
      setIsLoadingZoomAccounts(false);
    }
  }

  function formatZoomType(type: number | null): string {
    if (type === 1) return "Básica";
    if (type === 2) return "Licenciada";
    if (type === 3) return "On-Prem";
    return "-";
  }

  function formatZoomAccountStatus(status: string): string {
    const normalized = (status || "").toLowerCase();
    if (normalized === "active") return "Activa";
    if (normalized === "inactive") return "Inactiva";
    if (normalized === "pending") return "Pendiente";
    if (normalized === "locked") return "Bloqueada";
    return status || "-";
  }

  function formatDurationHoursMinutes(totalMinutes: number): string {
    const minutes = Math.max(0, Math.floor(totalMinutes));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} h ${String(rest).padStart(2, "0")} min`;
  }

  function formatZoomDateTime(value: string): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date).replace(",", "");
  }

  function updateForm<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function estimateIntervalDays(regimen: string): number {
    const normalized = regimen.toLowerCase();
    if (normalized.includes("quinc")) return 14;
    if (normalized.includes("mens")) return 30;
    return 7;
  }

  function getIntervalDaysFromFrequency(freq: string, regimen: string): number {
    if (freq === "QUINCENAL") return 14;
    if (freq === "MENSUAL") return 30;
    if (freq === "PERSONALIZADA") return estimateIntervalDays(regimen);
    return 7;
  }

  function toIso(value: string, fieldName: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${fieldName} inválida.`);
    }
    return parsed.toISOString();
  }

  function formatModalidad(value: string): string {
    return value === "HIBRIDA" ? "Presencial" : "Virtual";
  }

  function formatDateTime(value: string): string {
    const date = new Date(value);
    return new Intl.DateTimeFormat("es-UY", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date).replace(",", "");
  }

  function formatDuration(startIso: string, endIso: string): string {
    const minutes = Math.max(0, Math.floor((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function getPreparacionDisplay(item: AgendaEvent): string {
    if (item.solicitud.modalidadReunion !== "HIBRIDA") return "";
    const prep = item.solicitud.patronRecurrencia?.["preparacionMinutos"];
    if (typeof prep !== "number" || prep <= 0) return "";
    const hours = Math.floor(prep / 60);
    const rest = prep % 60;
    return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function getAssignedPerson(item: AgendaEvent): string {
    const assigned = item.asignaciones?.[0]?.asistente?.usuario;
    if (!assigned) return "";
    return (
      assigned.name ||
      [assigned.firstName, assigned.lastName].filter(Boolean).join(" ") ||
      assigned.email ||
      ""
    );
  }

  function getEncargado(item: AgendaEvent): string {
    const docente = item.solicitud.docente?.usuario;
    if (!docente) return "";
    return docente.name || [docente.firstName, docente.lastName].filter(Boolean).join(" ") || docente.email || "";
  }

  async function submitDocenteSolicitud(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.tema.trim()) {
      setMessage("Debes completar el tema.");
      return;
    }

    setIsSubmittingSolicitud(true);
    try {
      const metadata = [
        `Responsable: ${form.responsable || "No especificado"}`,
        form.grabacion === "DEFINIR" ? "Grabación: A definir en clase" : undefined
      ]
        .filter(Boolean)
        .join("\n");

      const requiereAsistencia = form.asistenciaZoom === "SI";
      const requiereGrabacion = form.grabacion === "SI";

      let payload: Record<string, unknown>;

      if (form.unaOVarias === "UNA") {
        const startIso = toIso(form.fechaUnica, "Fecha única");
        const minutes = Number(form.duracionUnica);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          throw new Error("Duración de la reunión única inválida.");
        }
        const endIso = new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();

        payload = {
          titulo: form.tema.trim(),
          responsableNombre: form.responsable.trim(),
          programaNombre: form.programa.trim(),
          descripcion: [form.descripcionUnica.trim(), metadata].filter(Boolean).join("\n\n"),
          finalidadAcademica: form.programa.trim() || undefined,
          modalidadReunion: form.modalidad,
          tipoInstancias: "UNICA",
          fechaInicioSolicitada: startIso,
          fechaFinSolicitada: endIso,
          timezone: "America/Montevideo",
          controlAsistencia: form.controlAsistencia === "SI",
          docentesCorreos: form.correosDocentes.trim() || undefined,
          grabacionPreferencia:
            form.grabacion === "SI" ? "SI" : form.grabacion === "NO" ? "NO" : "A_DEFINIR",
          requiereGrabacion,
          requiereAsistencia,
          motivoAsistencia: requiereAsistencia ? "Asistencia solicitada desde formulario docente." : undefined
        };
      } else {
        const firstIso = toIso(form.primeraFecha, "Primera fecha");
        const firstDate = new Date(firstIso);
        const minutes = Number(form.duracionRecurrente);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          throw new Error("Duración de reunión periódica inválida.");
        }
        if (!form.fechaFinal) {
          throw new Error("Debes completar la fecha final.");
        }

        const firstTime = form.primeraFecha.split("T")[1] || "00:00";
        const finalStart = new Date(`${form.fechaFinal}T${firstTime}`);
        if (Number.isNaN(finalStart.getTime())) {
          throw new Error("Fecha final inválida.");
        }
        if (finalStart <= firstDate) {
          throw new Error("La fecha final debe ser posterior a la primera fecha.");
        }

        const endIso = new Date(finalStart.getTime() + minutes * 60_000).toISOString();
        const intervalDays = getIntervalDaysFromFrequency(
          form.frecuenciaRecurrente,
          form.regimenEncuentros
        );
        const totalInstancias = Math.max(
          2,
          Math.floor((finalStart.getTime() - firstDate.getTime()) / (intervalDays * 24 * 60 * 60 * 1000)) + 1
        );

        payload = {
          titulo: form.tema.trim(),
          responsableNombre: form.responsable.trim(),
          programaNombre: form.programa.trim(),
          descripcion: [form.descripcionRecurrente.trim(), metadata].filter(Boolean).join("\n\n"),
          finalidadAcademica: form.programa.trim() || undefined,
          modalidadReunion: form.modalidad,
          tipoInstancias: "MULTIPLE_COMPATIBLE_ZOOM",
          fechaInicioSolicitada: firstIso,
          fechaFinSolicitada: endIso,
          fechaFinRecurrencia: finalStart.toISOString(),
          timezone: "America/Montevideo",
          controlAsistencia: form.controlAsistencia === "SI",
          docentesCorreos: form.correosDocentes.trim() || undefined,
          grabacionPreferencia:
            form.grabacion === "SI" ? "SI" : form.grabacion === "NO" ? "NO" : "A_DEFINIR",
          requiereGrabacion,
          requiereAsistencia,
          motivoAsistencia: requiereAsistencia ? "Asistencia solicitada desde formulario docente." : undefined,
          regimenEncuentros: form.regimenEncuentros,
          patronRecurrencia: {
            totalInstancias,
            intervaloDias: intervalDays,
            frecuencia: form.frecuenciaRecurrente,
            regimenEncuentros: form.regimenEncuentros,
            fechaFinal: form.fechaFinal
          }
        };
      }

      const response = await fetch("/api/v1/solicitudes-sala", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { error?: string; request?: { id: string } };
      if (!response.ok) {
        setMessage(data.error ?? "No se pudo crear la solicitud.");
        return;
      }

      setMessage(`Solicitud creada correctamente: ${data.request?.id}`);
      await Promise.all([loadSolicitudes(), loadSummary(), loadAgenda(), loadManualPendings()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear la solicitud.");
    } finally {
      setIsSubmittingSolicitud(false);
    }
  }

  async function setInterest(eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA") {
    setUpdatingInterestId(eventoId);
    try {
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
    } finally {
      setUpdatingInterestId(null);
    }
  }

  async function loadGoogleAccountStatus() {
    setIsLoadingGoogleStatus(true);
    try {
      const response = await fetch("/api/v1/auth/accounts/google", { cache: "no-store" });
      const data = (await response.json()) as {
        error?: string;
        accounts?: Array<{ provider: string }>;
        hasPassword?: boolean;
      };
      if (!response.ok) {
        setMessage(data.error ?? "No se pudo obtener el estado de Google.");
        return;
      }

      const linked = Boolean(data.accounts?.some((account) => account.provider === "google"));
      setGoogleLinked(linked);
      setHasPassword(Boolean(data.hasPassword));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo obtener el estado de Google.");
    } finally {
      setIsLoadingGoogleStatus(false);
    }
  }

  async function linkGoogleAccount() {
    setMessage("");
    await signIn("google", { callbackUrl: "/" });
  }

  async function unlinkGoogleAccount() {
    setIsUnlinkingGoogleAccount(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/accounts/google", {
        method: "DELETE"
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok) {
        setMessage(data.error ?? "No se pudo desvincular la cuenta de Google.");
        return;
      }
      setGoogleLinked(false);
      setMessage(data.message ?? "Cuenta de Google desvinculada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo desvincular la cuenta de Google.");
    } finally {
      setIsUnlinkingGoogleAccount(false);
    }
  }

  async function syncProfileFromGoogle() {
    setIsSyncingGoogleProfile(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/auth/accounts/google", {
        method: "POST"
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        user?: CurrentUser;
      };
      if (!response.ok) {
        setMessage(data.error ?? "No se pudo sincronizar el perfil con Google.");
        return;
      }
      if (data.user) {
        setUser(data.user);
        setProfileForm({
          firstName: data.user.firstName ?? "",
          lastName: data.user.lastName ?? "",
          image: data.user.image ?? ""
        });
      }
      setMessage(data.message ?? "Perfil sincronizado con Google.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo sincronizar el perfil con Google.");
    } finally {
      setIsSyncingGoogleProfile(false);
    }
  }

  return (
    <section>
      <h1 className="title">Gestión Institucional de Salas Zoom</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {isDocente && (
          <button
            className={tab === "solicitudes" && docenteSolicitudesView === "form" ? "btn primary" : "btn ghost"}
            onClick={() => {
              setTab("solicitudes");
              setDocenteSolicitudesView("form");
            }}
            type="button"
          >
            Pedir sala Zoom
          </button>
        )}
        <button className={tab === "dashboard" ? "btn primary" : "btn ghost"} onClick={() => setTab("dashboard")} type="button">
          Dashboard
        </button>
        <button
          className={tab === "solicitudes" && (!isDocente || docenteSolicitudesView === "list") ? "btn primary" : "btn ghost"}
          onClick={() => {
            setTab("solicitudes");
            if (isDocente) setDocenteSolicitudesView("list");
          }}
          type="button"
        >
          {isDocente ? "Solicitudes hechas" : "Solicitudes"}
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
        {canSeeZoomAccounts && (
          <button className="btn ghost" onClick={() => setTab("cuentas")} type="button">
            Cuentas Zoom
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
          <h3 style={{ marginTop: 0 }}>{isDocente ? "Pedir sala Zoom" : "Solicitudes de sala"}</h3>

          {isDocente && docenteSolicitudesView === "form" ? (
            <form onSubmit={submitDocenteSolicitud}>
              <h4 style={{ marginBottom: 8 }}>Sección 1 de 3 - Datos generales</h4>
              <label style={{ display: "block", marginBottom: 8 }}>
                Tema
                <input
                  type="text"
                  required
                  value={form.tema}
                  onChange={(e) => updateForm("tema", e.target.value)}
                  placeholder="Nombre del Seminario / Clase / Reunión"
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

              <label style={{ display: "block", marginBottom: 8 }}>
                Modalidad
                <select value={form.modalidad} onChange={(e) => updateForm("modalidad", e.target.value)}>
                  <option value="VIRTUAL">Virtual</option>
                  <option value="HIBRIDA">Híbrida</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 8 }}>
                Grabación
                <select value={form.grabacion} onChange={(e) => updateForm("grabacion", e.target.value)}>
                  <option value="SI">Sí</option>
                  <option value="NO">No</option>
                  <option value="DEFINIR">A definir en clase</option>
                </select>
              </label>

              <label style={{ display: "block", marginBottom: 8 }}>
                Una o varias reuniones
                <select value={form.unaOVarias} onChange={(e) => updateForm("unaOVarias", e.target.value)}>
                  <option value="UNA">Una sola</option>
                  <option value="VARIAS">Varias</option>
                </select>
              </label>

              <ToggleButtons
                label="Control de asistencia"
                value={form.controlAsistencia}
                onChange={(val) => updateForm("controlAsistencia", val)}
              />

              {form.unaOVarias === "UNA" ? (
                <>
                  <h4 style={{ marginBottom: 8 }}>Sección 2 de 3 - Reunión única</h4>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Descripción (opcional)
                    <textarea
                      value={form.descripcionUnica}
                      onChange={(e) => updateForm("descripcionUnica", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Fecha (única)
                    <input
                      type="datetime-local"
                      required
                      value={form.fechaUnica}
                      onChange={(e) => updateForm("fechaUnica", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Duración de la reunión (minutos)
                    <input
                      type="number"
                      min={15}
                      step={15}
                      required
                      value={form.duracionUnica}
                      onChange={(e) => updateForm("duracionUnica", e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <h4 style={{ marginBottom: 8 }}>Sección 3 de 3 - Reuniones periódicas</h4>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Descripción (opcional)
                    <textarea
                      value={form.descripcionRecurrente}
                      onChange={(e) => updateForm("descripcionRecurrente", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Primera fecha
                    <input
                      type="datetime-local"
                      required
                      value={form.primeraFecha}
                      onChange={(e) => updateForm("primeraFecha", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Duración de la reunión recurrente (minutos)
                    <input
                      type="number"
                      min={15}
                      step={15}
                      required
                      value={form.duracionRecurrente}
                      onChange={(e) => updateForm("duracionRecurrente", e.target.value)}
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Régimen de encuentros
                    <textarea
                      required
                      value={form.regimenEncuentros}
                      onChange={(e) => updateForm("regimenEncuentros", e.target.value)}
                      placeholder="Ej: Todos los sábados"
                    />
                  </label>
                  <label style={{ display: "block", marginBottom: 8 }}>
                    Frecuencia de recurrencia
                    <select
                      value={form.frecuenciaRecurrente}
                      onChange={(e) => updateForm("frecuenciaRecurrente", e.target.value)}
                    >
                      <option value="SEMANAL">Semanal</option>
                      <option value="QUINCENAL">Quincenal</option>
                      <option value="MENSUAL">Mensual</option>
                      <option value="PERSONALIZADA">Personalizada (según régimen)</option>
                    </select>
                  </label>
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
          ) : !isDocente ? (
            <p className="muted">Selecciona una solicitud para revisar su detalle.</p>
          ) : null}

          {(!isDocente || docenteSolicitudesView === "list") && (
          <div style={{ marginTop: 12 }}>
            {isDocente && <h4 style={{ marginTop: 0 }}>Solicitudes ya hechas</h4>}
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
          )}
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
                  <th>Modalidad</th>
                  {!isAssistantRole && <th>Persona asignada</th>}
                  <th>Nombre actividad</th>
                  <th>Día y hora</th>
                  <th>Duración</th>
                  {!isAssistantRole && <th>Preparación</th>}
                  <th>Cuenta Zoom a manejar</th>
                  <th>Programa</th>
                  <th>Encargado</th>
                  <th>Link</th>
                  <th>Interés</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {agenda.map((item) => (
                  <tr key={item.id}>
                    <td>{formatModalidad(item.solicitud.modalidadReunion)}</td>
                    {!isAssistantRole && <td>{getAssignedPerson(item) || "-"}</td>}
                    <td>{item.solicitud.titulo}</td>
                    <td>{formatDateTime(item.inicioProgramadoAt)}</td>
                    <td className="mono">{formatDuration(item.inicioProgramadoAt, item.finProgramadoAt)}</td>
                    {!isAssistantRole && <td className="mono">{getPreparacionDisplay(item)}</td>}
                    <td>{item.cuentaZoom?.ownerEmail || item.cuentaZoom?.nombreCuenta || ""}</td>
                    <td>{item.solicitud.programaNombre || ""}</td>
                    <td>{getEncargado(item) || item.solicitud.responsableNombre || ""}</td>
                    <td>
                      {item.zoomJoinUrl ? (
                        <a href={item.zoomJoinUrl} target="_blank" rel="noreferrer">
                          {item.zoomJoinUrl}
                        </a>
                      ) : (
                        ""
                      )}
                    </td>
                    <td>{item.intereses[0]?.estadoInteres || "SIN_RESPUESTA"}</td>
                    <td>
                      {item.intereses[0]?.estadoInteres ? (
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span className="muted" style={{ margin: 0 }}>
                            Toggle interés
                          </span>
                          <input
                            type="checkbox"
                            checked={item.intereses[0].estadoInteres === "ME_INTERESA"}
                            disabled={updatingInterestId === item.id}
                            onChange={(e) =>
                              setInterest(item.id, e.target.checked ? "ME_INTERESA" : "NO_ME_INTERESA")
                            }
                          />
                          <span>{item.intereses[0].estadoInteres === "ME_INTERESA" ? "Me interesa" : "No me interesa"}</span>
                        </label>
                      ) : (
                        <>
                          <button
                            className="btn ghost"
                            onClick={() => setInterest(item.id, "ME_INTERESA")}
                            type="button"
                            disabled={updatingInterestId === item.id}
                          >
                            Me interesa
                          </button>
                          <button
                            className="btn ghost"
                            style={{ marginLeft: 8 }}
                            onClick={() => setInterest(item.id, "NO_ME_INTERESA")}
                            type="button"
                            disabled={updatingInterestId === item.id}
                          >
                            No me interesa
                          </button>
                        </>
                      )}
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

      {tab === "cuentas" && canSeeZoomAccounts && (
        <article className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ marginTop: 0, marginBottom: 0 }}>Cuentas Zoom disponibles</h3>
            <button className="btn ghost" onClick={() => void loadZoomAccounts()} type="button" disabled={isLoadingZoomAccounts}>
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
                  <th>Tipo</th>
                  <th>Estado de cuenta</th>
                  <th>Eventos pendientes (Zoom)</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {zoomAccounts.map((account) => (
                  <Fragment key={account.id}>
                    <tr>
                      <td>{account.email || "-"}</td>
                      <td>{[account.firstName, account.lastName].filter(Boolean).join(" ") || "-"}</td>
                      <td>{formatZoomType(account.type)}</td>
                      <td>{formatZoomAccountStatus(account.status)}</td>
                      <td>{account.pendingEventsCount}</td>
                      <td>
                        {account.pendingEventsCount > 0 ? (
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() =>
                              setExpandedZoomAccountId((prev) => (prev === account.id ? null : account.id))
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
                        <td colSpan={6}>
                          <div style={{ padding: "8px 0" }}>
                            <table>
                              <thead>
                                <tr>
                                  <th>Tema</th>
                                  <th>Inicio</th>
                                  <th>Duración</th>
                                  <th>Link</th>
                                </tr>
                              </thead>
                              <tbody>
                                {account.pendingEvents.map((event) => (
                                  <tr key={event.id}>
                                    <td>{event.topic}</td>
                                    <td>{formatZoomDateTime(event.startTime)}</td>
                                    <td>{formatDurationHoursMinutes(event.durationMinutes)}</td>
                                    <td>
                                      {event.joinUrl ? (
                                        <a href={event.joinUrl} target="_blank" rel="noreferrer">
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
      )}

      {tab === "perfil" && user && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
        <article className="card" style={{ width: "min(100%, 720px)" }}>
          <h3 style={{ marginTop: 0 }}>Mi perfil</h3>
          {!showProfileForm ? (
            <div>
              <div style={{ marginBottom: 16 }}>
                <p><strong>Nombre:</strong> {user.firstName || "-"}</p>
                <p><strong>Apellido:</strong> {user.lastName || "-"}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p style={{ marginTop: 12, marginBottom: 8 }}><strong>Foto de perfil:</strong></p>
                <div style={{ marginTop: 8 }}>
                  <UserAvatar
                    firstName={user.firstName}
                    lastName={user.lastName}
                    image={user.image}
                    size={100}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <h4 style={{ marginTop: 0, marginBottom: 8 }}>Cuenta de Google</h4>
                {isLoadingGoogleStatus ? (
                  <p className="muted" style={{ marginTop: 0 }}>Cargando estado de vinculación...</p>
                ) : (
                  <>
                    <p className="muted" style={{ marginTop: 0 }}>
                      Estado: {googleLinked ? "Vinculada" : "No vinculada"}
                    </p>
                    {!hasPassword && (
                      <p className="muted" style={{ marginTop: 0 }}>
                        Aviso: para desvincular Google debes tener contraseña establecida.
                      </p>
                    )}
                  </>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn ghost" type="button" onClick={() => void linkGoogleAccount()}>
                    Vincular Google
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => void unlinkGoogleAccount()}
                    disabled={!googleLinked || !hasPassword || isUnlinkingGoogleAccount}
                  >
                    {isUnlinkingGoogleAccount ? "Desvinculando..." : "Desvincular Google"}
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => void syncProfileFromGoogle()}
                    disabled={!googleLinked || isSyncingGoogleProfile}
                  >
                    {isSyncingGoogleProfile ? "Sincronizando..." : "Volver a sincronizar con Google"}
                  </button>
                </div>
              </div>
              <button className="btn primary" onClick={() => setShowProfileForm(true)} type="button">
                Editar perfil
              </button>
            </div>
          ) : (
            <form onSubmit={async (e) => {
              e.preventDefault();
              setIsUpdatingProfile(true);
              setMessage("");
              try {
                const response = await fetch("/api/v1/auth/profile", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    firstName: profileForm.firstName,
                    lastName: profileForm.lastName,
                    image: profileForm.image
                  })
                });
                const data = (await response.json()) as { error?: string; user?: CurrentUser };
                if (!response.ok) {
                  setMessage(data.error ?? "No se pudo actualizar el perfil.");
                  return;
                }
                if (data.user) {
                  setUser(data.user);
                  setProfileForm({
                    firstName: data.user.firstName ?? "",
                    lastName: data.user.lastName ?? "",
                    image: data.user.image ?? ""
                  });
                }
                setMessage("Perfil actualizado correctamente.");
                setShowProfileForm(false);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Error al actualizar perfil.");
              } finally {
                setIsUpdatingProfile(false);
              }
            }}>
              <label style={{ display: "block", marginBottom: 8 }}>
                Nombre
                <input
                  type="text"
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                  placeholder="Tu nombre"
                />
              </label>
              <label style={{ display: "block", marginBottom: 8 }}>
                Apellido
                <input
                  type="text"
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                  placeholder="Tu apellido"
                />
              </label>
              <label style={{ display: "block", marginBottom: 8 }}>
                URL de foto de perfil
                <input
                  type="url"
                  value={profileForm.image}
                  onChange={(e) => setProfileForm({ ...profileForm, image: e.target.value })}
                  placeholder="https://ejemplo.com/foto.jpg"
                />
              </label>
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: 0, marginBottom: 8 }}>Vista previa:</p>
                <UserAvatar
                  firstName={profileForm.firstName}
                  lastName={profileForm.lastName}
                  image={profileForm.image}
                  size={100}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn primary" type="submit" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? "Guardando..." : "Guardar cambios"}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setShowProfileForm(false);
                    setProfileForm({
                      firstName: user.firstName ?? "",
                      lastName: user.lastName ?? "",
                      image: user.image ?? ""
                    });
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </article>
        </div>
      )}

      {message && (
        <p className="muted" style={{ marginTop: 14 }}>
          {message}
        </p>
      )}
    </section>
  );
}
