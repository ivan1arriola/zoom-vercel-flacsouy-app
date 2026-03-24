"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { Alert, Backdrop, Box, CircularProgress, Tab as MuiTab, Tabs, Typography } from "@mui/material";
import { UserAvatar } from "@/components/user-avatar";
import { ToggleButtons } from "@/components/toggle-buttons";
import {
  buildRecurringStarts,
  buildRecurrenceSummary,
  formatDateTime,
  formatDuration,
  getZoomWeekday,
  parseWeekdaysCsv,
  type ZoomMonthlyMode,
  type ZoomRecurrenceType,
  zoomMonthlyWeekOptions,
  zoomWeekdayOptions
} from "@/src/lib/spa-home/recurrence";
import {
  loadSummary,
  loadAssignmentBoard,
  type DashboardSummary,
  type AssignmentBoardEvent,
  type AssignableAssistant
} from "@/src/services/dashboardApi";
import {
  loadPastMeetings,
  loadSolicitudes,
  submitDocenteSolicitud as submitDocenteSolicitudApi,
  deleteSolicitud as deleteSolicitudApi,
  cancelSolicitudSerie as cancelSolicitudSerieApi,
  cancelSolicitudInstancia as cancelSolicitudInstanciaApi,
  submitPastMeeting as submitPastMeetingApi,
  type Solicitud
} from "@/src/services/solicitudesApi";
import {
  createPrograma as createProgramaApi,
  loadProgramas,
  type Programa
} from "@/src/services/programasApi";
import {
  loadAgendaLibre,
  setInterest as setInterestApi,
  assignAssistantToEvent as assignAssistantToEventApi,
  type AgendaEvent
} from "@/src/services/agendaApi";
import {
  loadUsers,
  submitCreateUser as submitCreateUserApi,
  loadGoogleAccountStatus,
  unlinkGoogleAccount as unlinkGoogleAccountApi,
  syncProfileFromGoogle as syncProfileFromGoogleApi,
  updateProfile,
  type ManagedUser
} from "@/src/services/userApi";
import {
  loadTarifas,
  submitTarifaUpdate as submitTarifaUpdateApi
} from "@/src/services/tarifasApi";
import {
  loadZoomAccounts,
  loadManualPendings,
  type ZoomAccount
} from "@/src/services/zoomApi";
import { useSolicitudes } from "@/src/hooks/useSolicitudes";
import { useTarifas, type TarifaModalidad } from "@/src/hooks/useTarifas";
import { useZoomAccounts } from "@/src/hooks/useZoomAccounts";
import { useManagedUsers } from "@/src/hooks/useManagedUsers";
import { useAgendaLibre } from "@/src/hooks/useAgendaLibre";
import { useAssignmentBoard } from "@/src/hooks/useAssignmentBoard";
import { useUserProfile } from "@/src/hooks/useUserProfile";
import { usePastMeetings } from "@/src/hooks/usePastMeetings";
import { useDashboard } from "@/src/hooks/useDashboard";
import { useUIState } from "@/src/hooks/useUIState";
import { SpaTabDashboard } from "@/components/spa-tabs/SpaTabDashboard";
import { SpaTabSolicitudes } from "@/components/spa-tabs/SpaTabSolicitudes";
import { SpaTabAgendaLibre } from "@/components/spa-tabs/SpaTabAgendaLibre";
import { SpaTabAsignacion } from "@/components/spa-tabs/SpaTabAsignacion";
import { SpaTabManual } from "@/components/spa-tabs/SpaTabManual";
import { SpaTabHistorico } from "@/components/spa-tabs/SpaTabHistorico";
import { SpaTabTarifas } from "@/components/spa-tabs/SpaTabTarifas";
import { SpaTabCuentas } from "@/components/spa-tabs/SpaTabCuentas";
import { SpaTabUsuarios } from "@/components/spa-tabs/SpaTabUsuarios";
import { SpaTabPerfil } from "@/components/spa-tabs/SpaTabPerfil";
import {
  formatZoomDateTime as formatZoomDateTimeUtil,
  formatManagedUserRole as formatManagedUserRoleUtil,
  formatManagedUserDate as formatManagedUserDateUtil,
  formatModalidad as formatModalidadUtil,
  normalizeZoomMeetingId,
  resolveZoomJoinUrl
} from "@/components/spa-tabs/spa-tabs-utils";
import {
  combineDateAndTimeToIso,
  resolveEndByTimeOrDuration,
  validateSolicitudTema,
  validatePastMeetingRequired
} from "@/components/spa-tabs/form-validators";


export type CurrentUser = {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
};

const tabs = [
  "dashboard",
  "solicitudes",
  "agenda_libre",
  "asignacion",
  "manual",
  "historico",
  "cuentas",
  "tarifas",
  "usuarios",
  "perfil"
] as const;
type Tab = (typeof tabs)[number];
const EMAIL_LINE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeSupportRole(role: string): string {
  if (role === "ASISTENTE_ZOOM" || role === "SOPORTE_ZOOM") {
    return "SOPORTE_ZOOM";
  }
  return role;
}

function normalizeDocentesCorreosByLine(raw: string): string | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return undefined;

  const unique = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.includes(";") || line.includes(",")) {
      throw new Error(`Correos de docentes: usa un correo por linea (error en linea ${index + 1}).`);
    }
    if (!EMAIL_LINE_REGEX.test(line)) {
      throw new Error(`Correos de docentes: email invalido en linea ${index + 1}.`);
    }
    unique.add(line.toLowerCase());
  }

  return Array.from(unique.values()).join("\n");
}

export function SpaHome() {
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [isCreatingPrograma, setIsCreatingPrograma] = useState(false);

  // UI State
  const { tab, setTab, message, setMessage, loading, setLoading, requestedTab } = useUIState();
  
  // Solicitudes & Doctentes
  const {
    solicitudes,
    setSolicitudes,
    docenteSolicitudesView,
    setDocenteSolicitudesView,
    isSubmittingSolicitud,
    setIsSubmittingSolicitud,
    deletingSolicitudId,
    setDeletingSolicitudId,
    cancellingSerieSolicitudId,
    setCancellingSerieSolicitudId,
    cancellingInstanciaKey,
    setCancellingInstanciaKey,
    form,
    setForm,
    updateForm
  } = useSolicitudes();
  
  // Dashboard
  const { summary, setSummary, manualPendings, setManualPendings } = useDashboard();
  
  // Agenda Libre
  const { agendaLibre, setAgendaLibre, updatingInterestId, setUpdatingInterestId } = useAgendaLibre();
  
  // Assignment Board
  const { assignmentBoardEvents, setAssignmentBoardEvents, assignableAssistants, setAssignableAssistants, isLoadingAssignmentBoard, setIsLoadingAssignmentBoard, assigningEventId, setAssigningEventId, selectedAssistantByEvent, setSelectedAssistantByEvent } = useAssignmentBoard();
  
  // Tarifas
  const {
    setTarifas,
    isSubmittingTarifa,
    setIsSubmittingTarifa,
    tarifaFormByModalidad,
    setTarifaFormByModalidad,
    currentTarifaByModalidad
  } = useTarifas();
  
  // Zoom Accounts
  const { zoomAccounts, setZoomAccounts, zoomGroupName, setZoomGroupName, isLoadingZoomAccounts, setIsLoadingZoomAccounts, expandedZoomAccountId, setExpandedZoomAccountId } = useZoomAccounts();
  
  // Managed Users
  const { users, setUsers, isLoadingUsers, setIsLoadingUsers, isCreatingUser, setIsCreatingUser, createUserForm, setCreateUserForm } = useManagedUsers();
  
  // Past Meetings
  const {
    isSubmittingPastMeeting,
    setIsSubmittingPastMeeting,
    isLoadingPastMeetings,
    setIsLoadingPastMeetings,
    pastMeetings,
    setPastMeetings,
    pastMeetingForm,
    setPastMeetingForm
  } = usePastMeetings();
  
  // User Profile & Auth
  const { user, setUser, googleLinked, setGoogleLinked, hasPassword, setHasPassword, isLoadingGoogleStatus, setIsLoadingGoogleStatus, isSyncingGoogleProfile, setIsSyncingGoogleProfile, isUnlinkingGoogleAccount, setIsUnlinkingGoogleAccount, isUpdatingProfile, setIsUpdatingProfile, profileForm, setProfileForm, showProfileForm, setShowProfileForm } = useUserProfile();

  const { searchParams, tabs: availableTabs } = useUIState();
  
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
  const canSeePastMeetings = useMemo(() => effectiveRole === "ADMINISTRADOR", [effectiveRole]);
  const canSeeZoomAccounts = useMemo(() => effectiveRole === "ADMINISTRADOR", [effectiveRole]);
  const canSeeUsers = useMemo(() => effectiveRole === "ADMINISTRADOR", [effectiveRole]);
  const canSeeAgendaLibre = useMemo(
    () => ["SOPORTE_ZOOM", "ASISTENTE_ZOOM"].includes(user?.role ?? ""),
    [user?.role]
  );
  const canSeeAssignmentBoard = useMemo(() => effectiveRole === "ADMINISTRADOR", [effectiveRole]);
  const canSeeTarifas = useMemo(
    () => ["CONTADURIA", "ADMINISTRADOR"].includes(effectiveRole),
    [effectiveRole]
  );
  const isDocente = useMemo(() => effectiveRole === "DOCENTE", [effectiveRole]);
  const canCreateSolicitudShortcut = useMemo(
    () => ["DOCENTE", "ADMINISTRADOR"].includes(user?.role ?? ""),
    [user?.role]
  );
  const canDelegateSolicitudResponsable = useMemo(
    () => effectiveRole === "ADMINISTRADOR",
    [effectiveRole]
  );
  const canUseGoogleByEmail = useMemo(
    () => Boolean(user?.email?.trim().toLowerCase().endsWith("@flacso.edu.uy")),
    [user?.email]
  );
  const requesterDisplayName = useMemo(() => {
    if (!user) return "";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return fullName || user.email || "";
  }, [user]);
  const responsableOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();

    const addOption = (
      firstName: string | null | undefined,
      lastName: string | null | undefined,
      email: string | null | undefined
    ) => {
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const value = (fullName || email || "").trim();
      if (!value) return;
      if (map.has(value.toLowerCase())) return;
      const label = fullName && email ? `${fullName} (${email})` : value;
      map.set(value.toLowerCase(), { value, label });
    };

    for (const managedUser of users) {
      if (!["DOCENTE", "ADMINISTRADOR"].includes(managedUser.role)) continue;
      addOption(managedUser.firstName, managedUser.lastName, managedUser.email);
    }

    addOption(user?.firstName, user?.lastName, user?.email);

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [users, user]);
  const programaOptions = useMemo(
    () => programas.map((programa) => programa.nombre),
    [programas]
  );

  const isGlobalBusy = useMemo(
    () =>
      loading ||
      isSubmittingSolicitud ||
      Boolean(deletingSolicitudId) ||
      Boolean(cancellingSerieSolicitudId) ||
      Boolean(cancellingInstanciaKey),
    [loading, isSubmittingSolicitud, deletingSolicitudId, cancellingSerieSolicitudId, cancellingInstanciaKey]
  );

  const globalBusyLabel = useMemo(() => {
    if (isSubmittingSolicitud) return "Enviando solicitud...";
    if (deletingSolicitudId) return "Eliminando solicitud...";
    if (cancellingSerieSolicitudId) return "Cancelando serie...";
    if (cancellingInstanciaKey) return "Cancelando instancia...";
    return "Cargando...";
  }, [isSubmittingSolicitud, deletingSolicitudId, cancellingSerieSolicitudId, cancellingInstanciaKey]);

  // currentTarifaByModalidad is already provided by useTarifas hook
  // requestedTab is already provided by useUIState hook

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

      const loaders: Array<Promise<void>> = [
        (async () => {
          const summary = await loadSummary();
          if (summary) setSummary(summary);
        })(),
        (async () => {
          const solicitudes = await loadSolicitudes();
          if (solicitudes) setSolicitudes(solicitudes);
        })(),
        (async () => {
          const pendings = await loadManualPendings();
          if (pendings) setManualPendings(pendings);
        })(),
        (async () => {
          const tarifas = await loadTarifas();
          if (tarifas) setTarifas(tarifas);
        })(),
        (async () => {
          const loadedProgramas = await loadProgramas();
          if (loadedProgramas) setProgramas(loadedProgramas);
        })()
      ];

      if (meJson.user.role === "ADMINISTRADOR") {
        loaders.push(
          (async () => {
            const data = await loadAssignmentBoard();
            if (data) {
              setAssignmentBoardEvents(data.events ?? []);
              setAssignableAssistants(data.assistants ?? []);
              setSelectedAssistantByEvent((prev) => {
                const next = { ...prev };
                for (const event of data.events ?? []) {
                  if (!next[event.id]) {
                    next[event.id] = event.interesados[0]?.asistenteZoomId ?? "";
                  }
                }
                return next;
              });
            }
          })()
        );
        loaders.push(
          (async () => {
            const users = await loadUsers();
            if (users) setUsers(users);
          })()
        );
      }

      if (["SOPORTE_ZOOM", "ASISTENTE_ZOOM"].includes(meJson.user.role)) {
        loaders.push(
          (async () => {
            const agenda = await loadAgendaLibre();
            if (agenda) setAgendaLibre(agenda);
          })()
        );
      }

      await Promise.all(loaders);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!effectiveRole) return;
    if (tab === "agenda_libre" && !canSeeAgendaLibre) {
      setTab("dashboard");
      return;
    }
    if (tab === "asignacion" && !canSeeAssignmentBoard) {
      setTab("dashboard");
      return;
    }
    if (tab === "manual" && !canSeeManual) {
      setTab("dashboard");
      return;
    }
    if (tab === "historico" && !canSeePastMeetings) {
      setTab("dashboard");
      return;
    }
    if (tab === "cuentas" && !canSeeZoomAccounts) {
      setTab("dashboard");
      return;
    }
    if (tab === "usuarios" && !canSeeUsers) {
      setTab("dashboard");
      return;
    }
    if (tab === "tarifas" && !canSeeTarifas) {
      setTab("dashboard");
    }
  }, [
    effectiveRole,
    tab,
    canSeeAgendaLibre,
    canSeeAssignmentBoard,
    canSeeManual,
    canSeePastMeetings,
    canSeeZoomAccounts,
    canSeeUsers,
    canSeeTarifas
  ]);

  useEffect(() => {
    if (!requesterDisplayName) return;
    setForm((prev) => {
      if (prev.responsable.trim()) {
        return prev;
      }
      return {
        ...prev,
        responsable: requesterDisplayName
      };
    });
  }, [requesterDisplayName, setForm]);

  useEffect(() => {
    if (tab !== "perfil" || !user) return;
    if (!canUseGoogleByEmail) {
      setGoogleLinked(false);
      return;
    }
    (async () => {
      setIsLoadingGoogleStatus(true);
      try {
        const status = await loadGoogleAccountStatus();
        setGoogleLinked(status.linked);
        setHasPassword(status.hasPassword);
      } finally {
        setIsLoadingGoogleStatus(false);
      }
    })();
  }, [tab, user?.id, canUseGoogleByEmail]);

  useEffect(() => {
    if (tab !== "cuentas" || !canSeeZoomAccounts) return;
    (async () => {
      setIsLoadingZoomAccounts(true);
      try {
        const result = await loadZoomAccounts();
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setZoomGroupName(result.groupName);
        setZoomAccounts(result.accounts);
      } finally {
        setIsLoadingZoomAccounts(false);
      }
    })();
  }, [tab, canSeeZoomAccounts]);

  useEffect(() => {
    if (tab !== "usuarios" || !canSeeUsers) return;
    (async () => {
      setIsLoadingUsers(true);
      try {
        const users = await loadUsers();
        if (users) setUsers(users);
      } finally {
        setIsLoadingUsers(false);
      }
    })();
  }, [tab, canSeeUsers]);

  useEffect(() => {
    if (tab !== "agenda_libre" || !canSeeAgendaLibre) return;
    (async () => {
      const agenda = await loadAgendaLibre();
      if (agenda) setAgendaLibre(agenda);
    })();
  }, [tab, canSeeAgendaLibre]);

  useEffect(() => {
    if (tab !== "asignacion" || !canSeeAssignmentBoard) return;
    (async () => {
      setIsLoadingAssignmentBoard(true);
      try {
        const data = await loadAssignmentBoard();
        if (data) {
          setAssignmentBoardEvents(data.events ?? []);
          setAssignableAssistants(data.assistants ?? []);
          setSelectedAssistantByEvent((prev) => {
            const next = { ...prev };
            for (const event of data.events ?? []) {
              if (!next[event.id]) {
                next[event.id] = event.interesados[0]?.asistenteZoomId ?? "";
              }
            }
            return next;
          });
        }
      } finally {
        setIsLoadingAssignmentBoard(false);
      }
    })();
  }, [tab, canSeeAssignmentBoard]);

  useEffect(() => {
    if (tab !== "historico" || !canSeePastMeetings) return;
    void refreshPastMeetings();
  }, [tab, canSeePastMeetings]);

  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
  }, [requestedTab]);

  // Removed: All load* and fetch functions moved to service modules
  // They are now imported from @/src/services/{dashboardApi,solicitudesApi,agendaApi,userApi,tarifasApi,zoomApi}

  function isLicensedZoomAccount(account: ZoomAccount): boolean {
    return account.type === 2;
  }

  function isMeetingStartingSoon(startTime: string): boolean {
    const startMs = new Date(startTime).getTime();
    if (Number.isNaN(startMs)) return false;
    const diff = startMs - Date.now();
    const hours24 = 24 * 60 * 60 * 1000;
    return diff >= 0 && diff <= hours24;
  }

  function formatDurationHoursMinutes(totalMinutes: number): string {
    const minutes = Math.max(0, Math.floor(totalMinutes));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  // Using formatZoomDateTime from spa-tabs-utils
  const formatZoomDateTime = formatZoomDateTimeUtil;

  // Using formatManagedUserRole from spa-tabs-utils
  const formatManagedUserRole = formatManagedUserRoleUtil;

  // Using formatManagedUserDate from spa-tabs-utils
  const formatManagedUserDate = formatManagedUserDateUtil;

  // updateForm is now provided by useSolicitudes hook

  // Using form validators from form-validators module
  const formatModalidad = formatModalidadUtil;

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

  async function refreshAfterSolicitudMutation() {
    const [summaryData, solicitudesData, agendaData, assignmentData, manualData] = await Promise.all([
      loadSummary(),
      loadSolicitudes(),
      loadAgendaLibre(),
      loadAssignmentBoard(),
      loadManualPendings()
    ]);

    if (summaryData) setSummary(summaryData);
    if (solicitudesData) setSolicitudes(solicitudesData);
    if (agendaData) setAgendaLibre(agendaData);
    if (assignmentData) {
      setAssignmentBoardEvents(assignmentData.events ?? []);
      setAssignableAssistants(assignmentData.assistants ?? []);
    }
    if (manualData) setManualPendings(manualData);
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
      const normalizedDocentesCorreos = normalizeDocentesCorreosByLine(form.correosDocentes);

      let payload: Record<string, unknown>;

      if (form.unaOVarias === "UNA") {
        const startIso = combineDateAndTimeToIso(form.diaUnica, form.horaInicioUnica, "dia y hora de inicio");
        const { endIso } = resolveEndByTimeOrDuration(
          startIso,
          form.horaFinUnica,
          form.duracionUnica,
          "la reunion unica"
        );

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
          docentesCorreos: normalizedDocentesCorreos,
          grabacionPreferencia:
            form.grabacion === "SI" ? "SI" : form.grabacion === "NO" ? "NO" : "A_DEFINIR",
          requiereGrabacion,
          requiereAsistencia,
          motivoAsistencia: requiereAsistencia ? "Asistencia solicitada desde formulario docente." : undefined
        };
      } else {
        const firstAnchorIso = combineDateAndTimeToIso(
          form.primerDiaRecurrente,
          form.horaInicioRecurrente,
          "primer dia y hora de inicio"
        );
        const firstAnchorDate = new Date(firstAnchorIso);
        const { durationMinutes } = resolveEndByTimeOrDuration(
          firstAnchorIso,
          form.horaFinRecurrente,
          form.duracionRecurrente,
          "las reuniones periodicas"
        );
        if (!form.fechaFinal) {
          throw new Error("Debes completar la fecha final.");
        }

        const recurrenceEnd = new Date(`${form.fechaFinal}T${form.horaInicioRecurrente || "00:00"}`);
        if (Number.isNaN(recurrenceEnd.getTime())) {
          throw new Error("Fecha final invalida.");
        }
        if (recurrenceEnd <= firstAnchorDate) {
          throw new Error("La fecha final debe ser posterior a la primera fecha.");
        }

        const recurrenceType = form.recurrenciaTipoZoom as ZoomRecurrenceType;
        if (!["1", "2", "3"].includes(recurrenceType)) {
          throw new Error("Tipo de recurrencia invalido.");
        }

        const repeatInterval = Number(form.recurrenciaIntervalo);
        if (!Number.isInteger(repeatInterval) || repeatInterval < 1) {
          throw new Error("Intervalo de recurrencia invalido.");
        }

        const maxRepeatInterval = recurrenceType === "1" ? 90 : recurrenceType === "2" ? 12 : 3;
        if (repeatInterval > maxRepeatInterval) {
          throw new Error(`El intervalo supera el maximo permitido por Zoom (${maxRepeatInterval}).`);
        }

        const weeklyDays = parseWeekdaysCsv(form.recurrenciaDiasSemana);
        if (recurrenceType === "2" && weeklyDays.length === 0) {
          throw new Error("Debes seleccionar al menos un dia para recurrencia semanal.");
        }
        const weeklyDaysForRule =
          recurrenceType === "2"
            ? [...new Set([...weeklyDays, getZoomWeekday(firstAnchorDate)])].sort((a, b) => a - b)
            : [];

        const monthlyMode = form.recurrenciaMensualModo as ZoomMonthlyMode;
        if (!["DAY_OF_MONTH", "WEEKDAY_OF_MONTH"].includes(monthlyMode)) {
          throw new Error("Modo mensual invalido.");
        }

        const monthlyDay = Number(form.recurrenciaDiaMes);
        if (recurrenceType === "3" && monthlyMode === "DAY_OF_MONTH" && (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31)) {
          throw new Error("El dia del mes debe estar entre 1 y 31.");
        }

        const monthlyWeek = Number(form.recurrenciaSemanaMes) as -1 | 1 | 2 | 3 | 4;
        if (recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH" && ![-1, 1, 2, 3, 4].includes(monthlyWeek)) {
          throw new Error("La semana del mes es invalida.");
        }

        const monthlyWeekDay = Number(form.recurrenciaDiaSemanaMes);
        if (recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH" && (!Number.isInteger(monthlyWeekDay) || monthlyWeekDay < 1 || monthlyWeekDay > 7)) {
          throw new Error("El dia de semana mensual es invalido.");
        }

        const recurringStarts = buildRecurringStarts({
          firstStart: firstAnchorDate,
          recurrenceEnd,
          recurrenceType,
          repeatInterval,
          weeklyDays: weeklyDaysForRule,
          monthlyMode,
          monthlyDay,
          monthlyWeek,
          monthlyWeekDay
        });

        if (recurringStarts.length < 2) {
          throw new Error("Con esa configuracion no se generan al menos 2 instancias.");
        }
        if (recurringStarts.length > 50) {
          throw new Error("Zoom permite un maximo de 50 ocurrencias por reunion recurrente.");
        }

        const firstInstanceStart = recurringStarts[0];
        const firstInstanceEndIso = new Date(
          firstInstanceStart.getTime() + durationMinutes * 60_000
        ).toISOString();

        const recurrenceSummary = buildRecurrenceSummary({
          recurrenceType,
          repeatInterval,
          weeklyDays: weeklyDaysForRule,
          monthlyMode,
          monthlyDay,
          monthlyWeek,
          monthlyWeekDay,
          totalInstancias: recurringStarts.length,
          fechaFinal: form.fechaFinal
        });

        payload = {
          titulo: form.tema.trim(),
          responsableNombre: form.responsable.trim(),
          programaNombre: form.programa.trim(),
          descripcion: [form.descripcionRecurrente.trim(), metadata].filter(Boolean).join("\n\n"),
          finalidadAcademica: form.programa.trim() || undefined,
          modalidadReunion: form.modalidad,
          tipoInstancias: "MULTIPLE_COMPATIBLE_ZOOM",
          fechaInicioSolicitada: firstInstanceStart.toISOString(),
          fechaFinSolicitada: firstInstanceEndIso,
          fechaFinRecurrencia: recurrenceEnd.toISOString(),
          timezone: "America/Montevideo",
          controlAsistencia: form.controlAsistencia === "SI",
          docentesCorreos: normalizedDocentesCorreos,
          grabacionPreferencia:
            form.grabacion === "SI" ? "SI" : form.grabacion === "NO" ? "NO" : "A_DEFINIR",
          requiereGrabacion,
          requiereAsistencia,
          motivoAsistencia: requiereAsistencia ? "Asistencia solicitada desde formulario docente." : undefined,
          regimenEncuentros: recurrenceSummary,
          instanciasDetalle: recurringStarts.map((date) => ({
            inicioProgramadoAt: date.toISOString()
          })),
          patronRecurrencia: {
            totalInstancias: recurringStarts.length,
            fechaFinal: form.fechaFinal,
            zoomRecurrence: {
              type: Number(recurrenceType),
              repeat_interval: repeatInterval,
              weekly_days: recurrenceType === "2" ? weeklyDaysForRule.join(",") : undefined,
              monthly_day:
                recurrenceType === "3" && monthlyMode === "DAY_OF_MONTH" ? monthlyDay : undefined,
              monthly_week:
                recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH"
                  ? monthlyWeek
                  : undefined,
              monthly_week_day:
                recurrenceType === "3" && monthlyMode === "WEEKDAY_OF_MONTH"
                  ? monthlyWeekDay
                  : undefined,
              end_times: recurringStarts.length
            }
          }
        };
      }

      const response = await submitDocenteSolicitudApi(payload);
      if (!response.success) {
        setMessage(response.error ?? "No se pudo crear la solicitud.");
        return;
      }

      setMessage(`Solicitud creada correctamente: ${response.requestId}`);
      setDocenteSolicitudesView("list");
      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear la solicitud.");
    } finally {
      setIsSubmittingSolicitud(false);
    }
  }

  async function deleteSolicitud(solicitudId: string) {
    if (!window.confirm("Se eliminara la solicitud y tambien la reunion en Zoom. ¿Continuar?")) {
      return;
    }

    setDeletingSolicitudId(solicitudId);
    setMessage("");

    try {
      const response = await deleteSolicitudApi(solicitudId);
      if (!response.success) {
        setMessage(response.error ?? "No se pudo eliminar la solicitud.");
        return;
      }

      const zoomMessage = response.zoomMeetingId
        ? response.deletedInZoom
          ? ` Reunión Zoom ${response.zoomMeetingId} eliminada.`
          : ` Zoom no reportó eliminación para ${response.zoomMeetingId} (puede ya no existir).`
        : "";
      setMessage(`Solicitud eliminada correctamente.${zoomMessage}`);

      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar la solicitud.");
    } finally {
      setDeletingSolicitudId(null);
    }
  }

  async function cancelSolicitudSerie(solicitudId: string, titulo: string) {
    if (!window.confirm(`Se cancelara toda la serie de "${titulo}" en Zoom y en el sistema. ¿Continuar?`)) {
      return;
    }

    setCancellingSerieSolicitudId(solicitudId);
    setMessage("");

    try {
      const response = await cancelSolicitudSerieApi(solicitudId);
      if (!response.success) {
        setMessage(response.error ?? "No se pudo cancelar la serie.");
        return;
      }

      const zoomMessage = response.result?.zoomMeetingId
        ? response.result?.cancelledInZoom
          ? ` Serie Zoom ${response.result.zoomMeetingId} cancelada.`
          : ` Zoom no reportó cancelación para ${response.result.zoomMeetingId} (puede ya no existir).`
        : "";
      setMessage(`Serie cancelada correctamente.${zoomMessage}`);
      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cancelar la serie.");
    } finally {
      setCancellingSerieSolicitudId(null);
    }
  }

  async function cancelSolicitudInstancia(input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    occurrenceId?: string | null;
    startTime: string;
  }) {
    const instanceDateLabel = formatDateTime(input.startTime);
    if (!window.confirm(`Se cancelara la instancia ${instanceDateLabel} de "${input.titulo}". ¿Continuar?`)) {
      return;
    }

    const instanceKey = `${input.solicitudId}:${input.eventoId ?? input.occurrenceId ?? input.startTime}`;
    setCancellingInstanciaKey(instanceKey);
    setMessage("");

    try {
      const response = await cancelSolicitudInstanciaApi({
        solicitudId: input.solicitudId,
        eventoId: input.eventoId ?? undefined,
        occurrenceId: input.occurrenceId ?? undefined,
        inicioProgramadoAt: input.startTime
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo cancelar la instancia.");
        return;
      }

      const zoomMessage = response.result?.zoomMeetingId
        ? response.result?.cancelledInZoom
          ? ` Instancia cancelada en Zoom (${response.result.zoomMeetingId}).`
          : ` Zoom no reportó cancelación (ID ${response.result.zoomMeetingId}).`
        : "";
      setMessage(`Instancia cancelada correctamente.${zoomMessage}`);
      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cancelar la instancia.");
    } finally {
      setCancellingInstanciaKey(null);
    }
  }

  async function setInterest(eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA") {
    setUpdatingInterestId(eventoId);
    try {
      const response = await setInterestApi(eventoId, estadoInteres);
      if (!response.success) {
        setMessage(response.error ?? "No se pudo registrar interés.");
        return;
      }
      setMessage("Interés actualizado.");
      const [agendaData, assignmentData] = await Promise.all([loadAgendaLibre(), loadAssignmentBoard()]);
      if (agendaData) setAgendaLibre(agendaData);
      if (assignmentData) {
        setAssignmentBoardEvents(assignmentData.events ?? []);
        setAssignableAssistants(assignmentData.assistants ?? []);
      }
    } finally {
      setUpdatingInterestId(null);
    }
  }

  async function assignAssistantToEvent(eventoId: string) {
    const asistenteZoomId = selectedAssistantByEvent[eventoId];
    if (!asistenteZoomId) {
      setMessage("Debes seleccionar una persona para asignar.");
      return;
    }

    setAssigningEventId(eventoId);
    try {
      const response = await assignAssistantToEventApi(eventoId, asistenteZoomId);
      if (!response.success) {
        setMessage(response.error ?? "No se pudo asignar soporte.");
        return;
      }

      setMessage("Asignacion registrada.");
      const [assignmentData, summaryData] = await Promise.all([loadAssignmentBoard(), loadSummary()]);
      if (assignmentData) {
        setAssignmentBoardEvents(assignmentData.events ?? []);
        setAssignableAssistants(assignmentData.assistants ?? []);
      }
      if (summaryData) setSummary(summaryData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo asignar soporte.");
    } finally {
      setAssigningEventId(null);
    }
  }

  // Removed: loadGoogleAccountStatus function now called from useEffect with API service

  async function linkGoogleAccount() {
    if (!canUseGoogleByEmail) {
      setMessage("Google solo esta habilitado para cuentas @flacso.edu.uy.");
      return;
    }
    setMessage("");
    await signIn("google", { callbackUrl: "/" });
  }

  async function unlinkGoogleAccount() {
    setIsUnlinkingGoogleAccount(true);
    setMessage("");
    try {
      const response = await unlinkGoogleAccountApi();
      if (!response.success) {
        setMessage(response.error ?? "No se pudo desvincular la cuenta de Google.");
        return;
      }
      setGoogleLinked(false);
      setMessage(response.message ?? "Cuenta de Google desvinculada.");
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
      const response = await syncProfileFromGoogleApi();
      if (!response.success) {
        setMessage(response.error ?? "No se pudo sincronizar el perfil con Google.");
        return;
      }
      if (response.user) {
        setUser(response.user);
        setProfileForm({
          firstName: response.user.firstName ?? "",
          lastName: response.user.lastName ?? "",
          image: response.user.image ?? ""
        });
      }
      setMessage(response.message ?? "Perfil sincronizado con Google.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo sincronizar el perfil con Google.");
    } finally {
      setIsSyncingGoogleProfile(false);
    }
  }

  async function submitCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsCreatingUser(true);

    try {
      const response = await submitCreateUserApi({
        firstName: createUserForm.firstName,
        lastName: createUserForm.lastName,
        email: createUserForm.email,
        role: createUserForm.role
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo crear el usuario.");
        return;
      }

      setCreateUserForm((prev) => ({
        ...prev,
        email: "",
        firstName: "",
        lastName: "",
        role: "DOCENTE"
      }));
      setMessage("Usuario creado. Enviamos un enlace magico de activacion por correo.");
      const users = await loadUsers();
      if (users) setUsers(users);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function submitTarifaUpdate(modalidad: TarifaModalidad) {
    setMessage("");

    const form = tarifaFormByModalidad[modalidad];
    const parsedValue = Number(form.valorHora.replace(",", "."));
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      setMessage("Valor hora invalido.");
      return;
    }

    setIsSubmittingTarifa(true);
    try {
      const response = await submitTarifaUpdateApi({
        modalidadReunion: modalidad,
        valorHora: parsedValue,
        moneda: form.moneda.trim() || "UYU"
      });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo actualizar la tarifa.");
        return;
      }
      setMessage(`Tarifa actualizada para ${modalidad}.`);
      const tarifas = await loadTarifas();
      if (tarifas) setTarifas(tarifas);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar la tarifa.");
    } finally {
      setIsSubmittingTarifa(false);
    }
  }

  async function refreshPastMeetings() {
    setIsLoadingPastMeetings(true);
    try {
      const meetings = await loadPastMeetings();
      if (!meetings) {
        setMessage("No se pudo cargar la lista de reuniones pasadas.");
        return;
      }
      setPastMeetings(meetings);
    } finally {
      setIsLoadingPastMeetings(false);
    }
  }

  async function submitPastMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmittingPastMeeting(true);
    try {
      const response = await submitPastMeetingApi({
        titulo: pastMeetingForm.titulo.trim(),
        modalidadReunion: pastMeetingForm.modalidadReunion,
        docenteEmail: pastMeetingForm.docenteEmail.trim().toLowerCase(),
        monitorEmail: pastMeetingForm.monitorEmail.trim().toLowerCase() || undefined,
        zoomMeetingId: pastMeetingForm.zoomMeetingId.trim() || undefined,
        inicioRealAt: new Date(pastMeetingForm.inicioRealAt).toISOString(),
        finRealAt: new Date(pastMeetingForm.finRealAt).toISOString(),
        programaNombre: pastMeetingForm.programaNombre.trim() || undefined,
        responsableNombre: pastMeetingForm.responsableNombre.trim() || undefined,
        descripcion: pastMeetingForm.descripcion.trim() || undefined,
        zoomJoinUrl: pastMeetingForm.zoomJoinUrl.trim() || undefined
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo registrar la reunion pasada.");
        return;
      }

      setPastMeetingForm({
        titulo: "",
        modalidadReunion: "VIRTUAL",
        docenteEmail: "",
        monitorEmail: "",
        zoomMeetingId: "",
        inicioRealAt: "",
        finRealAt: "",
        programaNombre: "",
        responsableNombre: "",
        descripcion: "",
        zoomJoinUrl: ""
      });
      setMessage(`Reunion registrada correctamente: ${response.solicitudId ?? ""}`);
      const [solicitudesData, summaryData, meetingsData] = await Promise.all([
        loadSolicitudes(),
        loadSummary(),
        loadPastMeetings()
      ]);
      if (solicitudesData) setSolicitudes(solicitudesData);
      if (summaryData) setSummary(summaryData);
      if (meetingsData) setPastMeetings(meetingsData);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar la reunion pasada.");
    } finally {
      setIsSubmittingPastMeeting(false);
    }
  }

  async function createProgramaOnDemand(nombre: string): Promise<string | null> {
    setIsCreatingPrograma(true);
    try {
      const response = await createProgramaApi(nombre);
      if (!response.success || !response.programa) {
        setMessage(response.error ?? "No se pudo crear el programa.");
        return null;
      }

      setProgramas((prev) => {
        const exists = prev.some((item) => item.id === response.programa?.id);
        const next = exists ? prev : [...prev, response.programa as Programa];
        return [...next].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      });
      setMessage(`Programa listo: ${response.programa.nombre}`);
      return response.programa.nombre;
    } finally {
      setIsCreatingPrograma(false);
    }
  }

  return (
    <Box component="section">
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1.5 }}>
        Herramienta para coordinar salas Zoom
      </Typography>

      <Tabs
        value={tab}
        onChange={(_event, nextValue) => setTab(nextValue as Tab)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2 }}
      >
        <MuiTab value="dashboard" label="Dashboard" />
        <MuiTab value="solicitudes" label="Solicitudes" />
        {canSeeAgendaLibre && <MuiTab value="agenda_libre" label="Agenda libre" />}
        {canSeeAssignmentBoard && <MuiTab value="asignacion" label="Asignacion de personal" />}
        {canSeeManual && <MuiTab value="manual" label="Resolucion manual" />}
        {canSeePastMeetings && <MuiTab value="historico" label="Reuniones pasadas" />}
        {canSeeZoomAccounts && <MuiTab value="cuentas" label="Cuentas Zoom" />}
        {canSeeTarifas && <MuiTab value="tarifas" label="Tarifas" />}
        {canSeeUsers && <MuiTab value="usuarios" label="Usuarios" />}
      </Tabs>

      {loading && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1.5 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Cargando...</Typography>
        </Box>
      )}

      {tab === "dashboard" && <SpaTabDashboard summary={summary} />}

      {tab === "solicitudes" && (
        <SpaTabSolicitudes
          solicitudes={solicitudes}
          form={form}
          updateForm={updateForm}
          onDeleteSolicitud={deleteSolicitud}
          deletingSolicitudId={deletingSolicitudId}
          onCancelSolicitudSerie={cancelSolicitudSerie}
          cancellingSerieSolicitudId={cancellingSerieSolicitudId}
          onCancelSolicitudInstancia={cancelSolicitudInstancia}
          cancellingInstanciaKey={cancellingInstanciaKey}
          canDeleteSolicitud={canCreateSolicitudShortcut}
          isSubmittingSolicitud={isSubmittingSolicitud}
          canCreateShortcut={canCreateSolicitudShortcut}
          canDelegateResponsable={canDelegateSolicitudResponsable}
          responsableOptions={responsableOptions}
          programaOptions={programaOptions}
          isCreatingPrograma={isCreatingPrograma}
          onCreatePrograma={createProgramaOnDemand}
          docenteSolicitudesView={docenteSolicitudesView}
          setDocenteSolicitudesView={setDocenteSolicitudesView}
          onSubmit={submitDocenteSolicitud}
        />
      )}

      {tab === "agenda_libre" && canSeeAgendaLibre && (
        <SpaTabAgendaLibre
          agendaLibre={agendaLibre}
          updatingInterestId={updatingInterestId}
          onSetInterest={setInterest}
        />
      )}

      {tab === "asignacion" && canSeeAssignmentBoard && (
        <SpaTabAsignacion
          assignmentBoardEvents={assignmentBoardEvents}
          assignableAssistants={assignableAssistants}
          isLoadingAssignmentBoard={isLoadingAssignmentBoard}
          assigningEventId={assigningEventId}
          selectedAssistantByEvent={selectedAssistantByEvent}
          onSelectedAssistantChange={(eventId, assistantId) =>
            setSelectedAssistantByEvent((prev) => ({ ...prev, [eventId]: assistantId }))
          }
          onAssignAssistant={assignAssistantToEvent}
        />
      )}

      {tab === "manual" && canSeeManual && (
        <SpaTabManual manualPendings={manualPendings} />
      )}

      {tab === "historico" && canSeePastMeetings && (
        <SpaTabHistorico
          pastMeetings={pastMeetings}
          isLoadingPastMeetings={isLoadingPastMeetings}
          onRefreshPastMeetings={() => {
            void refreshPastMeetings();
          }}
          pastMeetingForm={pastMeetingForm}
          setPastMeetingForm={setPastMeetingForm}
          isSubmittingPastMeeting={isSubmittingPastMeeting}
          onSubmit={submitPastMeeting}
        />
      )}

      {tab === "tarifas" && canSeeTarifas && (
        <SpaTabTarifas
          tarifaFormByModalidad={tarifaFormByModalidad}
          setTarifaFormByModalidad={setTarifaFormByModalidad}
          isSubmittingTarifa={isSubmittingTarifa}
          currentTarifaByModalidad={{
            HIBRIDA: currentTarifaByModalidad.HIBRIDA ?? undefined,
            VIRTUAL: currentTarifaByModalidad.VIRTUAL ?? undefined
          }}
          onSubmit={submitTarifaUpdate}
        />
      )}

      {tab === "cuentas" && canSeeZoomAccounts && (
        <SpaTabCuentas
          zoomAccounts={zoomAccounts}
          zoomGroupName={zoomGroupName}
          isLoadingZoomAccounts={isLoadingZoomAccounts}
          expandedZoomAccountId={expandedZoomAccountId}
          setExpandedZoomAccountId={setExpandedZoomAccountId}
          onRefresh={() => {
            setIsLoadingZoomAccounts(true);
            (async () => {
              try {
                const result = await loadZoomAccounts();
                if (result.error) {
                  setMessage(result.error);
                  return;
                }
                setZoomGroupName(result.groupName);
                setZoomAccounts(result.accounts);
              } finally {
                setIsLoadingZoomAccounts(false);
              }
            })();
          }}
        />
      )}

      {tab === "usuarios" && canSeeUsers && (
        <SpaTabUsuarios
          users={users}
          createUserForm={createUserForm}
          setCreateUserForm={setCreateUserForm}
          isCreatingUser={isCreatingUser}
          isLoadingUsers={isLoadingUsers}
          onSubmit={submitCreateUser}
          onRefresh={() => {
            setIsLoadingUsers(true);
            (async () => {
              try {
                const users = await loadUsers();
                if (users) setUsers(users);
              } finally {
                setIsLoadingUsers(false);
              }
            })();
          }}
        />
      )}

      {tab === "perfil" && user && (
        <SpaTabPerfil
          user={user}
          showProfileForm={showProfileForm}
          setShowProfileForm={setShowProfileForm}
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          googleLinked={googleLinked}
          hasPassword={hasPassword}
          isLoadingGoogleStatus={isLoadingGoogleStatus}
          isSyncingGoogleProfile={isSyncingGoogleProfile}
          isUnlinkingGoogleAccount={isUnlinkingGoogleAccount}
          isUpdatingProfile={isUpdatingProfile}
          canUseGoogleByEmail={canUseGoogleByEmail}
          onLinkGoogleAccount={linkGoogleAccount}
          onUnlinkGoogleAccount={unlinkGoogleAccount}
          onSyncProfileFromGoogle={syncProfileFromGoogle}
          onSubmit={async (e) => {
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
          }}
        />
      )}



      {message && <Alert sx={{ mt: 1.8 }} severity="info">{message}</Alert>}

      <Backdrop
        open={isGlobalBusy}
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 10,
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 1.2
        }}
      >
        <CircularProgress color="inherit" />
        <Typography variant="body1" sx={{ color: "#fff", fontWeight: 600 }}>
          {globalBusyLabel}
        </Typography>
      </Backdrop>
    </Box>
  );
}












