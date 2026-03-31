"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import {
  Alert,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
  Stack,
  Typography
} from "@mui/material";
import {
  formatDateTime
} from "@/src/lib/spa-home/recurrence";
import {
  NAVIGATION_GROUP_LABEL,
  NAVIGATION_GROUP_ORDER,
  TAB_CONFIG,
  canAccessTabForRole,
  getNavigationGroupIcon,
  getTabIcon,
  isViewRole,
  normalizeAssistantRole,
  type NavigationGroup,
  type Tab,
  type ViewRole,
  tabs,
  VIEW_ROLE_COOKIE
} from "@/src/lib/spa-home/navigation";
import { normalizeDocentesCorreosByLine } from "@/src/lib/spa-home/validation";
import {
  loadSummary,
  loadAssignmentBoard
} from "@/src/services/dashboardApi";
import {
  loadPastMeetings,
  loadSolicitudes,
  submitDocenteSolicitud as submitDocenteSolicitudApi,
  deleteSolicitud as deleteSolicitudApi,
  cancelSolicitudSerie as cancelSolicitudSerieApi,
  cancelSolicitudInstancia as cancelSolicitudInstanciaApi,
  submitPastMeeting as submitPastMeetingApi,
  sendSolicitudReminder as sendSolicitudReminderApi
} from "@/src/services/solicitudesApi";
import {
  createPrograma as createProgramaApi,
  loadProgramas,
  type Programa
} from "@/src/services/programasApi";
import {
  loadAgendaLibre,
  setInterest as setInterestApi,
  assignAssistantToEvent as assignAssistantToEventApi
} from "@/src/services/agendaApi";
import {
  loadUsers,
  submitCreateUser as submitCreateUserApi,
  submitUpdateUserRole as submitUpdateUserRoleApi,
  submitResendUserActivationLink as submitResendUserActivationLinkApi,
  submitSendSelfActivationLinkTest as submitSendSelfActivationLinkTestApi,
  loadGoogleAccountStatus,
  unlinkGoogleAccount as unlinkGoogleAccountApi,
  syncProfileFromGoogle as syncProfileFromGoogleApi
} from "@/src/services/userApi";
import {
  loadTarifas,
  submitTarifaUpdate as submitTarifaUpdateApi
} from "@/src/services/tarifasApi";
import {
  loadZoomAccounts,
  loadManualPendings,
  loadZoomUpcomingMeetings,
  loadZoomPastMeetings,
  type ZoomUpcomingMeeting
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
import { useZoomUpcomingMeetings } from "@/src/hooks/useZoomUpcomingMeetings";
import { useZoomPastMeetings } from "@/src/hooks/useZoomPastMeetings";
import { SpaTabDashboard } from "@/components/spa-tabs/SpaTabDashboard";
import { SpaTabSolicitudes } from "@/components/spa-tabs/SpaTabSolicitudes";
import { SpaTabProgramas } from "@/components/spa-tabs/SpaTabProgramas";
import { SpaTabAgendaLibre } from "@/components/spa-tabs/SpaTabAgendaLibre";
import { SpaTabMisAsistencias } from "@/components/spa-tabs/SpaTabMisAsistencias";
import { SpaTabAsignacion } from "@/components/spa-tabs/SpaTabAsignacion";
import { SpaTabManual, type ManualResolutionInput } from "@/components/spa-tabs/SpaTabManual";
import { SpaTabHistorico } from "@/components/spa-tabs/SpaTabHistorico";
import { SpaTabTarifas } from "@/components/spa-tabs/SpaTabTarifas";
import { SpaTabCuentas } from "@/components/spa-tabs/SpaTabCuentas";
import { SpaTabProximasReuniones } from "@/components/spa-tabs/SpaTabProximasReuniones";
import { SpaTabPasadasReunionesZoom } from "@/components/spa-tabs/SpaTabPasadasReunionesZoom";
import { SpaTabUsuarios } from "@/components/spa-tabs/SpaTabUsuarios";
import { SpaTabPerfil } from "@/components/spa-tabs/SpaTabPerfil";
import { buildDocenteSolicitudPayload } from "@/components/spa-tabs/solicitud-payload-builder";


export type CurrentUser = {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
};

type PastMeetingZoomSeed = {
  meetingId: string;
  topic: string;
  startTime: string;
  endTime: string;
  joinUrl: string;
  accountEmail: string;
};

type DocenteOption = {
  value: string;
  label: string;
  nombre: string;
};

type MonitorOption = {
  value: string;
  label: string;
  nombre: string;
};

const DEFAULT_ZOOM_PAST_MONTHS_BACK = 1;
export function SpaHomeScreen() {
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [isCreatingPrograma, setIsCreatingPrograma] = useState(false);
  const [isRefreshingProgramas, setIsRefreshingProgramas] = useState(false);

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
    sendingReminderSolicitudId,
    setSendingReminderSolicitudId,
    form,
    setForm,
    updateForm
  } = useSolicitudes();
  
  // Dashboard
  const { summary, setSummary, manualPendings, setManualPendings } = useDashboard();
  const [resolvingManualSolicitudId, setResolvingManualSolicitudId] = useState<string | null>(null);
  
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
  const {
    zoomUpcomingMeetings,
    setZoomUpcomingMeetings,
    isLoadingZoomUpcomingMeetings,
    setIsLoadingZoomUpcomingMeetings
  } = useZoomUpcomingMeetings();
  const {
    zoomPastMeetings,
    setZoomPastMeetings,
    isLoadingZoomPastMeetings,
    setIsLoadingZoomPastMeetings
  } = useZoomPastMeetings();
  const [zoomPastMonthsBack, setZoomPastMonthsBack] = useState(DEFAULT_ZOOM_PAST_MONTHS_BACK);
  const [canLoadMoreZoomPastMeetings, setCanLoadMoreZoomPastMeetings] = useState(true);
  const [isLoadingMoreZoomPastMeetings, setIsLoadingMoreZoomPastMeetings] = useState(false);
  
  // Managed Users
  const {
    users,
    setUsers,
    isLoadingUsers,
    setIsLoadingUsers,
    isCreatingUser,
    setIsCreatingUser,
    updatingUserId,
    setUpdatingUserId,
    resendingActivationUserId,
    setResendingActivationUserId,
    createUserForm,
    setCreateUserForm
  } = useManagedUsers();
  const [isSendingSelfActivationLink, setIsSendingSelfActivationLink] = useState(false);
  
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
  const [pastMeetingZoomSeed, setPastMeetingZoomSeed] = useState<PastMeetingZoomSeed | null>(null);
  
  // User Profile & Auth
  const { user, setUser, googleLinked, setGoogleLinked, hasPassword, setHasPassword, isLoadingGoogleStatus, setIsLoadingGoogleStatus, isSyncingGoogleProfile, setIsSyncingGoogleProfile, isUnlinkingGoogleAccount, setIsUnlinkingGoogleAccount, isUpdatingProfile, setIsUpdatingProfile, profileForm, setProfileForm, showProfileForm, setShowProfileForm } = useUserProfile();

  const { searchParams } = useUIState();
  
  const adminViewRole = useMemo<ViewRole>(() => {
    const rawRole = normalizeAssistantRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
    if (rawRole === "DOCENTE" || rawRole === "CONTADURIA") return rawRole;
    return "ADMINISTRADOR";
  }, [searchParams]);

  const effectiveRole = useMemo<ViewRole | "">(() => {
    if (!user?.role) return "";
    const normalizedUserRole = normalizeAssistantRole(user.role);
    if (!isViewRole(normalizedUserRole)) return "";
    if (normalizedUserRole !== "ADMINISTRADOR") return normalizedUserRole;
    return adminViewRole;
  }, [user, adminViewRole]);

  const canSeeManual = canAccessTabForRole("manual", effectiveRole);
  const canSeePastMeetings = canAccessTabForRole("historico", effectiveRole);
  const canSeeZoomAccounts = canAccessTabForRole("cuentas", effectiveRole);
  const canSeeUsers = canAccessTabForRole("usuarios", effectiveRole);
  const canSeeAgendaLibre = canAccessTabForRole("agenda_libre", effectiveRole);
  const canSeeMisAsistencias = canAccessTabForRole("mis_asistencias", effectiveRole);
  const canSeeAssignmentBoard = canAccessTabForRole("asignacion", effectiveRole);
  const canSeeTarifas = canAccessTabForRole("tarifas", effectiveRole);
  const canSeeSolicitudes = canAccessTabForRole("solicitudes", effectiveRole);
  const canSeeProgramas = canAccessTabForRole("programas", effectiveRole);
  const isDocente = useMemo(() => effectiveRole === "DOCENTE", [effectiveRole]);
  const canSendSolicitudReminder = useMemo(
    () => ["DOCENTE", "ADMINISTRADOR", "CONTADURIA"].includes(effectiveRole),
    [effectiveRole]
  );
  const canCreateSolicitudShortcut = useMemo(
    () => ["DOCENTE", "ADMINISTRADOR"].includes(effectiveRole),
    [effectiveRole]
  );
  const canDelegateSolicitudResponsable = useMemo(
    () => effectiveRole === "ADMINISTRADOR",
    [effectiveRole]
  );
  const visibleNavigationTabs = useMemo(
    () =>
      tabs.filter((candidateTab) => {
        const config = TAB_CONFIG[candidateTab];
        return config.visibleInNavigation && canAccessTabForRole(candidateTab, effectiveRole);
      }),
    [effectiveRole]
  );
  const groupedNavigationTabs = useMemo(() => {
    const grouped: Record<NavigationGroup, Tab[]> = {
      GENERAL: [],
      OPERACION: [],
      ZOOM: [],
      ADMIN: []
    };
    for (const item of visibleNavigationTabs) {
      grouped[TAB_CONFIG[item].group].push(item);
    }
    return grouped;
  }, [visibleNavigationTabs]);
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
  const docenteOptions = useMemo<DocenteOption[]>(() => {
    const map = new Map<string, DocenteOption>();

    const addDocente = (
      email: string | null | undefined,
      firstName: string | null | undefined,
      lastName: string | null | undefined,
      name: string | null | undefined
    ) => {
      const normalizedEmail = (email ?? "").trim().toLowerCase();
      if (!normalizedEmail) return;
      if (map.has(normalizedEmail)) return;

      const computedName =
        (name ?? "").trim() ||
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        normalizedEmail;

      map.set(normalizedEmail, {
        value: normalizedEmail,
        label: `${computedName} (${normalizedEmail})`,
        nombre: computedName
      });
    };

    for (const managedUser of users) {
      if (!["DOCENTE", "ADMINISTRADOR"].includes(managedUser.role)) continue;
      addDocente(
        managedUser.email,
        managedUser.firstName,
        managedUser.lastName,
        null
      );
    }

    addDocente(user?.email, user?.firstName, user?.lastName, null);

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [users, user]);
  const monitorOptions = useMemo<MonitorOption[]>(() => {
    const map = new Map<string, MonitorOption>();

    const addMonitor = (
      email: string | null | undefined,
      firstName: string | null | undefined,
      lastName: string | null | undefined
    ) => {
      const normalizedEmail = (email ?? "").trim().toLowerCase();
      if (!normalizedEmail) return;
      if (map.has(normalizedEmail)) return;

      const computedName = [firstName, lastName].filter(Boolean).join(" ").trim() || normalizedEmail;
      map.set(normalizedEmail, {
        value: normalizedEmail,
        label: `${computedName} (${normalizedEmail})`,
        nombre: computedName
      });
    };

    for (const managedUser of users) {
      if (normalizeAssistantRole(managedUser.role) !== "ASISTENTE_ZOOM") continue;
      addMonitor(managedUser.email, managedUser.firstName, managedUser.lastName);
    }

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [users, user]);
  const programaOptions = useMemo(
    () => programas.map((programa) => programa.nombre),
    [programas]
  );
  const manualAccountOptions = useMemo(
    () =>
      zoomAccounts.map((account) => ({
        id: account.id,
        label: account.email || [account.firstName, account.lastName].filter(Boolean).join(" ").trim() || account.id
      })),
    [zoomAccounts]
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
    const rawViewAs = normalizeAssistantRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
    if (rawViewAs === "ADMINISTRADOR") {
      document.cookie = `${VIEW_ROLE_COOKIE}=; path=/; max-age=0; samesite=lax`;
      return;
    }

    const allowedViewAs = ["DOCENTE", "CONTADURIA"];
    if (!allowedViewAs.includes(rawViewAs)) {
      document.cookie = `${VIEW_ROLE_COOKIE}=; path=/; max-age=0; samesite=lax`;
      return;
    }

    document.cookie = `${VIEW_ROLE_COOKIE}=${encodeURIComponent(rawViewAs)}; path=/; max-age=604800; samesite=lax`;
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

      const normalizedRole = normalizeAssistantRole(meJson.user.role);
      const loaders: Array<Promise<void>> = [
        (async () => {
          const summary = await loadSummary();
          if (summary) setSummary(summary);
        })()
      ];

      if (normalizedRole === "ADMINISTRADOR") {
        loaders.push(
          (async () => {
            const pendings = await loadManualPendings();
            if (pendings) setManualPendings(pendings);
          })()
        );
      }

      if (["ADMINISTRADOR", "CONTADURIA"].includes(normalizedRole)) {
        loaders.push(
          (async () => {
            const tarifas = await loadTarifas();
            if (tarifas) setTarifas(tarifas);
          })()
        );
      }

      if (["DOCENTE", "ADMINISTRADOR", "CONTADURIA"].includes(normalizedRole)) {
        loaders.push(
          (async () => {
            const loadedProgramas = await loadProgramas();
            if (loadedProgramas) setProgramas(loadedProgramas);
          })()
        );
      }

      if (["DOCENTE", "ADMINISTRADOR", "CONTADURIA"].includes(normalizedRole)) {
        loaders.push(
          (async () => {
            const solicitudes = await loadSolicitudes();
            if (solicitudes) setSolicitudes(solicitudes);
          })()
        );
      }

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
                    next[event.id] =
                      event.currentAssignment?.asistenteZoomId ??
                      event.interesados[0]?.asistenteZoomId ??
                      "";
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

      if (normalizedRole === "ASISTENTE_ZOOM") {
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
    if (canAccessTabForRole(tab, effectiveRole)) return;
    setTab("dashboard");
  }, [effectiveRole, tab, setTab]);

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
    if ((tab !== "cuentas" && tab !== "manual") || !canSeeZoomAccounts) return;
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
    if (tab !== "proximas_zoom" || !canSeeZoomAccounts) return;
    void refreshZoomUpcomingMeetings();
  }, [tab, canSeeZoomAccounts]);

  useEffect(() => {
    if (tab !== "pasadas_zoom" || !canSeeZoomAccounts) return;
    void refreshZoomPastMeetings();
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
                next[event.id] =
                  event.currentAssignment?.asistenteZoomId ??
                  event.interesados[0]?.asistenteZoomId ??
                  "";
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

  async function refreshManualPendings() {
    const pendings = await loadManualPendings();
    if (!pendings) {
      setMessage("No se pudieron cargar los pendientes manuales.");
      return;
    }
    setManualPendings(pendings);
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

  async function resolveManualProvision(input: ManualResolutionInput) {
    setMessage("");
    setResolvingManualSolicitudId(input.solicitudId);
    try {
      const response = await fetch(
        `/api/v1/provision-manual/${encodeURIComponent(input.solicitudId)}/resolver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cuentaZoomAsignadaId: input.cuentaZoomAsignadaId,
            accionTomada: "ASOCIACION_MANUAL_DESDE_PANEL",
            motivoSistema: "Resolucion manual realizada desde la pestaña Asociacion manual.",
            zoomMeetingIdManual: input.zoomMeetingIdManual,
            zoomJoinUrlManual: input.zoomJoinUrlManual,
            observaciones: input.observaciones
          })
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error ?? "No se pudo resolver manualmente la solicitud.");
        return;
      }

      setMessage("Pendiente manual resuelto correctamente.");
      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo resolver manualmente la solicitud.");
    } finally {
      setResolvingManualSolicitudId(null);
    }
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

      const normalizedDocentesCorreos = normalizeDocentesCorreosByLine(form.correosDocentes);
      const payload = buildDocenteSolicitudPayload({
        form,
        metadata,
        normalizedDocentesCorreos,
        timezone: "America/Montevideo"
      });

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

  async function sendSolicitudReminder(input: {
    solicitudId: string;
    toEmail?: string;
    mensaje?: string;
  }): Promise<boolean> {
    setMessage("");
    setSendingReminderSolicitudId(input.solicitudId);
    try {
      const response = await sendSolicitudReminderApi({
        solicitudId: input.solicitudId,
        toEmail: input.toEmail,
        mensaje: input.mensaje
      });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo enviar el recordatorio.");
        return false;
      }
      setMessage(
        response.sentTo
          ? `Recordatorio enviado a ${response.sentTo}.`
          : "Recordatorio enviado correctamente."
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo enviar el recordatorio.");
      return false;
    } finally {
      setSendingReminderSolicitudId(null);
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
        setMessage(response.error ?? "No se pudo asignar asistencia.");
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
      setMessage(error instanceof Error ? error.message : "No se pudo asignar asistencia.");
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
      setMessage("Usuario creado. Enviamos un enlace de activacion por correo para completar el alta.");
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

  async function updateUserRole(userId: string, role: string) {
    setMessage("");
    setUpdatingUserId(userId);
    try {
      const response = await submitUpdateUserRoleApi({ userId, role });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo actualizar el rol del usuario.");
        return;
      }

      const users = await loadUsers();
      if (users) setUsers(users);
      setMessage("Rol actualizado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el rol del usuario.");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function resendUserActivationLink(userId: string) {
    setMessage("");
    setResendingActivationUserId(userId);
    try {
      const response = await submitResendUserActivationLinkApi({ userId });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo reenviar el enlace de activacion.");
        return;
      }
      setMessage("Enlace de activacion reenviado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reenviar el enlace de activacion.");
    } finally {
      setResendingActivationUserId(null);
    }
  }

  async function sendSelfActivationLinkTest() {
    setMessage("");
    setIsSendingSelfActivationLink(true);
    try {
      const response = await submitSendSelfActivationLinkTestApi();
      if (!response.success) {
        setMessage(response.error ?? "No se pudo enviar el enlace de prueba.");
        return;
      }
      setMessage("Enlace de prueba enviado a tu correo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo enviar el enlace de prueba.");
    } finally {
      setIsSendingSelfActivationLink(false);
    }
  }

  function toDateTimeLocalInput(value: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  async function refreshZoomUpcomingMeetings() {
    setIsLoadingZoomUpcomingMeetings(true);
    try {
      const result = await loadZoomUpcomingMeetings();
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setZoomGroupName(result.groupName);
      setZoomUpcomingMeetings(result.meetings);
    } finally {
      setIsLoadingZoomUpcomingMeetings(false);
    }
  }

  async function refreshZoomPastMeetings(monthsBack = zoomPastMonthsBack) {
    setIsLoadingZoomPastMeetings(true);
    try {
      const result = await loadZoomPastMeetings({ monthsBack });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setZoomGroupName(result.groupName);
      setZoomPastMeetings(result.meetings);
      setZoomPastMonthsBack(result.monthsBack);
      setCanLoadMoreZoomPastMeetings(result.canLoadMoreBack);
    } finally {
      setIsLoadingZoomPastMeetings(false);
    }
  }

  async function loadMoreZoomPastMeetings() {
    if (!canLoadMoreZoomPastMeetings) return;
    const nextMonthsBack = zoomPastMonthsBack + 1;
    setIsLoadingMoreZoomPastMeetings(true);
    try {
      await refreshZoomPastMeetings(nextMonthsBack);
    } finally {
      setIsLoadingMoreZoomPastMeetings(false);
    }
  }

  function preloadPastMeetingFormFromZoom(meeting: ZoomUpcomingMeeting) {
    const seed: PastMeetingZoomSeed | null =
      meeting.meetingId && meeting.startTime && meeting.endTime
        ? {
            meetingId: meeting.meetingId,
            topic: meeting.topic || "Sin titulo",
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            joinUrl: meeting.joinUrl || "",
            accountEmail: meeting.accountEmail || "sin cuenta"
          }
        : null;

    setPastMeetingZoomSeed(seed);
    setPastMeetingForm({
      titulo: meeting.topic || "",
      modalidadReunion: "VIRTUAL",
      docenteEmail: "",
      responsableEmail: "",
      monitorEmail: "",
      zoomMeetingId: meeting.meetingId ?? "",
      inicioRealAt: toDateTimeLocalInput(meeting.startTime),
      finRealAt: toDateTimeLocalInput(meeting.endTime),
      programaNombre: "",
      descripcion: `Registro importado desde Zoom (${meeting.accountEmail || "sin cuenta"}).`,
      zoomJoinUrl: meeting.joinUrl || ""
    });
    setTab("historico");
    setMessage(
      seed
        ? "Registro asistido: datos base bloqueados segun Zoom. Completa solo los campos faltantes."
        : "Formulario de reunion pasada precargado con datos de Zoom."
    );
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
      const normalizedPrograma = pastMeetingForm.programaNombre.trim();
      if (!normalizedPrograma) {
        setMessage("Programa es obligatorio.");
        return;
      }

      const normalizedDocenteEmail = pastMeetingForm.docenteEmail.trim().toLowerCase();
      if (!normalizedDocenteEmail) {
        setMessage("Debes seleccionar el docente.");
        return;
      }
      const docenteOption = docenteOptions.find((option) => option.value === normalizedDocenteEmail);
      if (!docenteOption) {
        setMessage("Debes seleccionar un docente valido desde la lista.");
        return;
      }
      const normalizedResponsableEmail = pastMeetingForm.responsableEmail.trim().toLowerCase();
      if (!normalizedResponsableEmail) {
        setMessage("Debes seleccionar la persona responsable.");
        return;
      }
      const responsableOption = docenteOptions.find(
        (option) => option.value === normalizedResponsableEmail
      );
      if (!responsableOption) {
        setMessage("Debes seleccionar una persona responsable valida desde la lista.");
        return;
      }
      const normalizedMonitorEmail = pastMeetingForm.monitorEmail.trim().toLowerCase();
      if (!normalizedMonitorEmail) {
        setMessage("Debes asignar un Asistente Zoom para registrar la reunion pasada.");
        return;
      }
      const monitorOption = monitorOptions.find((option) => option.value === normalizedMonitorEmail);
      if (!monitorOption) {
        setMessage("Debes seleccionar un Asistente Zoom valido desde la lista.");
        return;
      }
      const lockedTitle = pastMeetingZoomSeed?.topic?.trim() || pastMeetingForm.titulo.trim();
      const lockedMeetingId = pastMeetingZoomSeed?.meetingId?.trim() || pastMeetingForm.zoomMeetingId.trim();
      const lockedStartIso = pastMeetingZoomSeed?.startTime
        ? new Date(pastMeetingZoomSeed.startTime).toISOString()
        : new Date(pastMeetingForm.inicioRealAt).toISOString();
      const lockedEndIso = pastMeetingZoomSeed?.endTime
        ? new Date(pastMeetingZoomSeed.endTime).toISOString()
        : new Date(pastMeetingForm.finRealAt).toISOString();
      const lockedJoinUrl =
        (pastMeetingZoomSeed?.joinUrl?.trim() || "") || pastMeetingForm.zoomJoinUrl.trim() || undefined;

      const response = await submitPastMeetingApi({
        titulo: lockedTitle,
        modalidadReunion: pastMeetingForm.modalidadReunion,
        docenteEmail: normalizedDocenteEmail,
        monitorEmail: normalizedMonitorEmail,
        zoomMeetingId: lockedMeetingId || undefined,
        inicioRealAt: lockedStartIso,
        finRealAt: lockedEndIso,
        programaNombre: normalizedPrograma,
        responsableEmail: normalizedResponsableEmail,
        descripcion: pastMeetingForm.descripcion.trim() || undefined,
        zoomJoinUrl: lockedJoinUrl
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo registrar la reunion pasada.");
        return;
      }

      setPastMeetingForm({
        titulo: "",
        modalidadReunion: "VIRTUAL",
        docenteEmail: "",
        responsableEmail: "",
        monitorEmail: "",
        zoomMeetingId: "",
        inicioRealAt: "",
        finRealAt: "",
        programaNombre: "",
        descripcion: "",
        zoomJoinUrl: ""
      });
      setPastMeetingZoomSeed(null);
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

  async function refreshProgramasView() {
    setIsRefreshingProgramas(true);
    try {
      const [loadedProgramas, loadedSolicitudes] = await Promise.all([
        loadProgramas(),
        loadSolicitudes()
      ]);
      if (loadedProgramas) setProgramas(loadedProgramas);
      if (loadedSolicitudes) setSolicitudes(loadedSolicitudes);
      if (!loadedProgramas && !loadedSolicitudes) {
        setMessage("No se pudo actualizar la vista de programas.");
      }
    } finally {
      setIsRefreshingProgramas(false);
    }
  }

  function selectNavigationGroup(group: NavigationGroup) {
    if (TAB_CONFIG[tab].group === group) return;
    const firstTab = groupedNavigationTabs[group][0];
    if (!firstTab) return;
    setTab(firstTab);
  }

  const activeNavigationGroup = TAB_CONFIG[tab].group;
  const activeNavigationTabs = groupedNavigationTabs[activeNavigationGroup];
  const activeNavigationLabel = NAVIGATION_GROUP_LABEL[activeNavigationGroup];
  const normalizedRoleLabel = (effectiveRole || "ADMINISTRADOR").replace(/_/g, " ");

  return (
    <Box component="section">
      <Paper
        variant="outlined"
        sx={{
          mb: 2,
          p: { xs: 1, sm: 1.5 },
          borderRadius: 3,
          backgroundColor: "background.paper"
        }}
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={1.4}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", lg: "center" }}
          sx={{ mb: 1.2 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary">
              Panel principal
            </Typography>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                lineHeight: 1.15,
                fontSize: { xs: "1.2rem", sm: "1.5rem" }
              }}
            >
              {TAB_CONFIG[tab].label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Seccion activa: {activeNavigationLabel}
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={0.8}
            useFlexGap
            flexWrap="wrap"
            sx={{ width: { xs: "100%", lg: "auto" } }}
          >
            <Chip size="small" variant="outlined" label={`Rol: ${normalizedRoleLabel}`} />
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={`Grupo: ${activeNavigationLabel}`}
            />
          </Stack>
        </Stack>

        <Box
          sx={{
            mb: 1.1,
            overflowX: "visible",
            pb: 0.2
          }}
        >
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {NAVIGATION_GROUP_ORDER.map((group) => {
              const groupTabs = groupedNavigationTabs[group];
              if (groupTabs.length === 0) return null;

              const isGroupActive = groupTabs.includes(tab);

              return (
                <Button
                  key={group}
                  size="small"
                  variant={isGroupActive ? "contained" : "outlined"}
                  color={isGroupActive ? "primary" : "inherit"}
                  startIcon={getNavigationGroupIcon(group)}
                  onClick={() => selectNavigationGroup(group)}
                  sx={{
                    textTransform: "none",
                    borderRadius: 2,
                    fontWeight: 700,
                    whiteSpace: "nowrap"
                  }}
                >
                  {NAVIGATION_GROUP_LABEL[group]} ({groupTabs.length})
                </Button>
              );
            })}
          </Stack>
        </Box>

        <Box
          sx={{
            overflowX: "visible",
            pb: 0.2
          }}
        >
          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
            {activeNavigationTabs.map((navigationTab) => (
              <Button
                key={navigationTab}
                size="small"
                variant={tab === navigationTab ? "contained" : "text"}
                color={tab === navigationTab ? "primary" : "inherit"}
                startIcon={getTabIcon(navigationTab)}
                onClick={() => setTab(navigationTab)}
                sx={{
                  textTransform: "none",
                  borderRadius: 2,
                  fontWeight: tab === navigationTab ? 700 : 600,
                  whiteSpace: "nowrap"
                }}
              >
                {TAB_CONFIG[navigationTab].label}
              </Button>
            ))}
          </Stack>
        </Box>
      </Paper>

      {tab === "dashboard" && (
        <SpaTabDashboard
          summary={summary}
          role={effectiveRole || "ADMINISTRADOR"}
        />
      )}

      {tab === "solicitudes" && canSeeSolicitudes && (
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
          canSendReminder={canSendSolicitudReminder}
          sendingReminderSolicitudId={sendingReminderSolicitudId}
          onSendReminder={sendSolicitudReminder}
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

      {tab === "programas" && canSeeProgramas && (
        <SpaTabProgramas
          programas={programas}
          solicitudes={solicitudes}
          isCreatingPrograma={isCreatingPrograma}
          isRefreshing={isRefreshingProgramas}
          onCreatePrograma={createProgramaOnDemand}
          onRefresh={() => {
            void refreshProgramasView();
          }}
        />
      )}

      {tab === "agenda_libre" && canSeeAgendaLibre && (
        <SpaTabAgendaLibre
          agendaLibre={agendaLibre}
          updatingInterestId={updatingInterestId}
          onSetInterest={setInterest}
        />
      )}

      {tab === "mis_asistencias" && canSeeMisAsistencias && user?.id && (
        <SpaTabMisAsistencias userId={user.id} />
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
        <SpaTabManual
          manualPendings={manualPendings}
          accountOptions={manualAccountOptions}
          isLoadingAccounts={isLoadingZoomAccounts}
          resolvingSolicitudId={resolvingManualSolicitudId}
          onRefresh={() => {
            void refreshManualPendings();
          }}
          onResolve={resolveManualProvision}
        />
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
          docenteOptions={docenteOptions}
          monitorOptions={monitorOptions}
          programaOptions={programaOptions}
          zoomSeed={pastMeetingZoomSeed}
          onClearZoomSeed={() => setPastMeetingZoomSeed(null)}
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

      {tab === "proximas_zoom" && canSeeZoomAccounts && (
        <SpaTabProximasReuniones
          groupName={zoomGroupName}
          meetings={zoomUpcomingMeetings}
          isLoading={isLoadingZoomUpcomingMeetings}
          onRefresh={() => {
            void refreshZoomUpcomingMeetings();
          }}
          onCreatePostMeetingRecord={preloadPastMeetingFormFromZoom}
        />
      )}

      {tab === "pasadas_zoom" && canSeeZoomAccounts && (
        <SpaTabPasadasReunionesZoom
          groupName={zoomGroupName}
          meetings={zoomPastMeetings}
          isLoading={isLoadingZoomPastMeetings}
          onRefresh={() => {
            void refreshZoomPastMeetings();
          }}
          onLoadMoreBack={() => {
            void loadMoreZoomPastMeetings();
          }}
          canLoadMoreBack={canLoadMoreZoomPastMeetings}
          isLoadingMoreBack={isLoadingMoreZoomPastMeetings}
          onCreatePostMeetingRecord={preloadPastMeetingFormFromZoom}
        />
      )}

      {tab === "usuarios" && canSeeUsers && (
        <SpaTabUsuarios
          users={users}
          createUserForm={createUserForm}
          setCreateUserForm={setCreateUserForm}
          isCreatingUser={isCreatingUser}
          updatingUserId={updatingUserId}
          resendingActivationUserId={resendingActivationUserId}
          isSendingSelfActivationLink={isSendingSelfActivationLink}
          isLoadingUsers={isLoadingUsers}
          onSubmit={submitCreateUser}
          onUpdateUserRole={updateUserRole}
          onResendActivationLink={resendUserActivationLink}
          onSendSelfActivationLinkTest={sendSelfActivationLinkTest}
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
      <Snackbar
        open={Boolean(message)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        onClose={(_, reason) => {
          if (reason === "clickaway") return;
          setMessage("");
        }}
        sx={{
          mt: { xs: 7, sm: 8 },
          width: { xs: "calc(100% - 16px)", sm: "auto" },
          maxWidth: { xs: "calc(100% - 16px)", sm: 860 }
        }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setMessage("")}
          sx={{
            width: "100%",
            alignItems: "center",
            boxShadow: 4
          }}
        >
          {message}
        </Alert>
      </Snackbar>

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




