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
  Fade,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Typography
} from "@mui/material";
import {
  formatDateTime
} from "@/src/lib/spa-home/recurrence";
import {
  canAccessTabForRole,
  getDefaultTabForRole,
  normalizeAssistantRole,
  resolveEffectiveRoleForUser,
  type ViewRole
} from "@/src/lib/spa-home/navigation";
import { normalizeDocentesCorreosByLine } from "@/src/lib/spa-home/validation";
import {
  loadSummary,
  loadAssignmentBoard,
  loadAssignmentSuggestion,
  loadNextAssignmentSuggestion,
  type AssignmentSuggestion
} from "@/src/services/dashboardApi";
import {
  loadPastMeetings,
  loadSolicitudes,
  submitDocenteSolicitud as submitDocenteSolicitudApi,
  deleteSolicitud as deleteSolicitudApi,
  cancelSolicitudSerie as cancelSolicitudSerieApi,
  cancelSolicitudInstancia as cancelSolicitudInstanciaApi,
  restoreSolicitudInstancia as restoreSolicitudInstanciaApi,
  addSolicitudInstancia as addSolicitudInstanciaApi,
  submitPastMeeting as submitPastMeetingApi,
  sendSolicitudReminder as sendSolicitudReminderApi,
  updatePastMeeting as updatePastMeetingApi,
  enableSolicitudAsistencia as enableSolicitudAsistenciaApi,
  updateSolicitudInstanciaAsistencia as updateSolicitudInstanciaAsistenciaApi
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
  unassignAssistantFromEvent as unassignAssistantFromEventApi
} from "@/src/services/agendaApi";
import {
  loadUsers,
  submitCreateUser as submitCreateUserApi,
  submitUpdateUserRole as submitUpdateUserRoleApi,
  submitResendUserActivationLink as submitResendUserActivationLinkApi,
  submitSendSelfActivationLinkTest as submitSendSelfActivationLinkTestApi,
  loadGoogleAccountStatus,
  unlinkGoogleAccount as unlinkGoogleAccountApi,
  syncProfileFromGoogle as syncProfileFromGoogleApi,
  updatePassword as updatePasswordApi
} from "@/src/services/userApi";
import {
  loadTarifas,
  submitTarifaUpdate as submitTarifaUpdateApi,
  downloadMonthlyAccountingReport
} from "@/src/services/tarifasApi";
import {
  loadZoomAccounts,
  loadManualPendings,
  loadZoomUpcomingMeetings,
  loadZoomPastMeetings,
  registerUpcomingMeetingInSystem as registerUpcomingMeetingInSystemApi,
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
import { SpaTabMisReunionesAsignadas } from "@/components/spa-tabs/SpaTabMisReunionesAsignadas";
import { SpaTabMisAsistencias } from "@/components/spa-tabs/SpaTabMisAsistencias";
import { SpaTabHistoricoAsistencias } from "@/components/spa-tabs/SpaTabHistoricoAsistencias";
import { SpaTabAsignacion } from "@/components/spa-tabs/SpaTabAsignacion";
import {
  SpaTabManual,
  type ManualMeetingOption,
  type ManualResolutionInput
} from "@/components/spa-tabs/SpaTabManual";
import { SpaTabHistorico } from "@/components/spa-tabs/SpaTabHistorico";
import { SpaTabTarifas } from "@/components/spa-tabs/SpaTabTarifas";
import { SpaTabGestionAsistentes } from "@/components/spa-tabs/SpaTabGestionAsistentes";
import { SpaTabCuentas } from "@/components/spa-tabs/SpaTabCuentas";
import { SpaTabProximasReuniones } from "@/components/spa-tabs/SpaTabProximasReuniones";
import { SpaTabPasadasReunionesZoom } from "@/components/spa-tabs/SpaTabPasadasReunionesZoom";
import { SpaTabZoomDriveSync } from "@/components/spa-tabs/SpaTabZoomDriveSync";
import { SpaTabUsuarios } from "@/components/spa-tabs/SpaTabUsuarios";
import { SpaTabPerfil } from "@/components/spa-tabs/SpaTabPerfil";
import { SpaTabEstadisticas } from "@/components/spa-tabs/SpaTabEstadisticas";
import { SpaTabNotificaciones } from "@/components/SpaTabNotificaciones";
import { buildDocenteSolicitudPayload } from "@/components/spa-tabs/solicitud-payload-builder";


export type CurrentUser = {
  id: string;
  email: string;
  emails?: string[];
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

type BusyOperationKey =
  | "BOOTSTRAP"
  | "SUBMIT_SOLICITUD"
  | "DELETE_SOLICITUD"
  | "CANCEL_SERIE"
  | "CANCEL_INSTANCIA"
  | "RESTORE_INSTANCIA"
  | "UPDATE_ASISTENCIA"
  | "GENERIC";

const BUSY_MESSAGES: Record<BusyOperationKey, string[]> = {
  BOOTSTRAP: [
    "Cargando tu espacio de trabajo...",
    "Verificando sesion y permisos...",
    "Preparando informacion inicial..."
  ],
  SUBMIT_SOLICITUD: [
    "Validando datos de la solicitud...",
    "Buscando cuenta Zoom libre...",
    "Reservando horario disponible...",
    "Guardando solicitud en el sistema...",
    "Finalizando registro y notificaciones..."
  ],
  DELETE_SOLICITUD: [
    "Eliminando solicitud...",
    "Desvinculando reunion en Zoom..."
  ],
  CANCEL_SERIE: [
    "Cancelando serie completa...",
    "Actualizando estado de instancias..."
  ],
  CANCEL_INSTANCIA: [
    "Cancelando instancia seleccionada...",
    "Sincronizando cambios..."
  ],
  RESTORE_INSTANCIA: [
    "Descancelando instancia...",
    "Resincronizando Zoom con la app..."
  ],
  UPDATE_ASISTENCIA: [
    "Actualizando asistencia Zoom...",
    "Aplicando cambios en instancias activas..."
  ],
  GENERIC: [
    "Procesando..."
  ]
};

const DEFAULT_ZOOM_PAST_MONTHS_BACK = 1;
const MAX_ZOOM_PAST_MONTHS_BACK = 12;

type ZoomPastMonthOption = {
  value: string;
  label: string;
  monthsBack: number;
};

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function buildZoomPastMonthOptions(maxMonthsBack = MAX_ZOOM_PAST_MONTHS_BACK): ZoomPastMonthOption[] {
  const now = new Date();
  const startOfCurrentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const formatter = new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });

  return Array.from({ length: maxMonthsBack }, (_unused, index) => {
    const monthDate = new Date(startOfCurrentMonth);
    monthDate.setUTCMonth(monthDate.getUTCMonth() - index);
    const value = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      value,
      label: formatter.format(monthDate),
      monthsBack: index + 1
    };
  });
}

function parseEmailLines(raw: string): string[] {
  const unique = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const normalized = line.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique.values());
}

function resolveSnackbarSeverity(message: string): "success" | "info" | "warning" | "error" {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "info";

  if (
    /(no se pudo|error|fall[oó]|no autenticado|unauthorized|inv[aá]lido|debes|denegad|prohibido|vencido|falta)/i.test(normalized)
  ) {
    return /(no autenticado|unauthorized|denegad|error|prohibido)/i.test(normalized) ? "error" : "warning";
  }

  if (
    /(correctamente|enviado|cread|actualizad|registrad|habilitad|sincronizad|listo|eliminad|cancelad|descancelad|resuelto|asignacion)/i.test(normalized)
  ) {
    return "success";
  }

  return "info";
}

function resolveUserAccessEmails(
  user?: { email?: string | null; emails?: string[] | null } | null
): string[] {
  if (!user) return [];
  const unique = new Set<string>();
  const primary = user.email?.trim().toLowerCase();
  if (primary) unique.add(primary);
  for (const email of user.emails ?? []) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique.values());
}

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
    restoringInstanciaKey,
    setRestoringInstanciaKey,
    sendingReminderSolicitudId,
    setSendingReminderSolicitudId,
    form,
    setForm,
    updateForm,
    isLoadingSolicitudes,
    setIsLoadingSolicitudes
  } = useSolicitudes();
  const [addingInstanciaSolicitudId, setAddingInstanciaSolicitudId] = useState<string | null>(null);
  
  // Dashboard
  const { 
    summary, setSummary, 
    isLoadingSummary, setIsLoadingSummary, 
    manualPendings, setManualPendings 
  } = useDashboard();
  const [resolvingManualSolicitudId, setResolvingManualSolicitudId] = useState<string | null>(null);
  
  // Agenda Libre
  const { agendaLibre, setAgendaLibre, updatingInterestId, setUpdatingInterestId } = useAgendaLibre();
  
  // Assignment Board
  const {
    assignmentBoardEvents,
    setAssignmentBoardEvents,
    assignableAssistants,
    setAssignableAssistants,
    isLoadingAssignmentBoard,
    setIsLoadingAssignmentBoard,
    assigningEventId,
    setAssigningEventId,
    selectedAssistantByEvent,
    setSelectedAssistantByEvent,
    assignmentSuggestion,
    setAssignmentSuggestion,
    suggestionSessionId,
    setSuggestionSessionId,
    isLoadingSuggestion,
    setIsLoadingSuggestion
  } = useAssignmentBoard();
  
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
  const zoomPastMonthOptions = useMemo(() => buildZoomPastMonthOptions(), []);
  const [selectedZoomPastMonthKey, setSelectedZoomPastMonthKey] = useState(
    () => zoomPastMonthOptions[0]?.value ?? ""
  );
  
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
  const [updatingPastMeetingId, setUpdatingPastMeetingId] = useState<string | null>(null);
  const [isRegisteringUpcomingMeeting, setIsRegisteringUpcomingMeeting] = useState(false);
  const [updatingAsistenciaSolicitudId, setUpdatingAsistenciaSolicitudId] = useState<string | null>(null);
  const [updatingAsistenciaInstanciaKey, setUpdatingAsistenciaInstanciaKey] = useState<string | null>(null);
  const [removingAssistanceAssignmentEventId, setRemovingAssistanceAssignmentEventId] = useState<string | null>(null);
  
  // User Profile & Auth
  const { 
    user, setUser, googleLinked, setGoogleLinked, hasPassword, setHasPassword, 
    isLoadingGoogleStatus, setIsLoadingGoogleStatus, isSyncingGoogleProfile, setIsSyncingGoogleProfile, 
    isUnlinkingGoogleAccount, setIsUnlinkingGoogleAccount, isUpdatingProfile, setIsUpdatingProfile, 
    profileForm, setProfileForm, showProfileForm, setShowProfileForm,
    isUpdatingPassword, setIsUpdatingPassword, passwordForm, setPasswordForm, showPasswordForm, setShowPasswordForm
  } = useUserProfile();

  const effectiveRole = useMemo<ViewRole | "">(
    () => resolveEffectiveRoleForUser(user?.role),
    [user?.role]
  );

  const canSeeManual = canAccessTabForRole("manual", effectiveRole);
  const canSeePastMeetings = canAccessTabForRole("historico", effectiveRole);
  const canSeeZoomAccounts = canAccessTabForRole("cuentas", effectiveRole);
  const canSeeZoomDriveSync = canAccessTabForRole("zoom_drive_sync", effectiveRole);
  const canSeeUsers = canAccessTabForRole("usuarios", effectiveRole);
  const canSeeAgendaLibre = canAccessTabForRole("agenda_libre", effectiveRole);
  const canSeeMisReunionesAsignadas = canAccessTabForRole("mis_reuniones_asignadas", effectiveRole);
  const canSeeMisAsistencias = canAccessTabForRole("mis_asistencias", effectiveRole);
  const canSeeHistoricoAsistencias = canAccessTabForRole("historico_asistencias", effectiveRole);
  const canSeeAsistentesAsignacion = canAccessTabForRole("asistentes_asignacion", effectiveRole);
  const canSeeAsistentesPerfiles = canAccessTabForRole("asistentes_perfiles", effectiveRole);
  const canSeeAsistentesEstadisticas = canAccessTabForRole("asistentes_estadisticas", effectiveRole);
  const canSeeGestionAsistentes = canSeeAsistentesAsignacion || canSeeAsistentesPerfiles || canSeeAsistentesEstadisticas;
  const canSeeTarifas = canAccessTabForRole("tarifas", effectiveRole);
  const canSeeEstadisticas = canAccessTabForRole("estadisticas", effectiveRole);
  const canSeeNotificaciones = canAccessTabForRole("notificaciones", effectiveRole);
  const canSeeSolicitudes = canAccessTabForRole("solicitudes", effectiveRole);
  const canSeeProgramas = canAccessTabForRole("programas", effectiveRole);
  const isDocente = useMemo(() => effectiveRole === "DOCENTE", [effectiveRole]);
  const canSendSolicitudReminder = useMemo(
    () => ["DOCENTE", "ADMINISTRADOR"].includes(effectiveRole),
    [effectiveRole]
  );
  const canCreateSolicitudShortcut = useMemo(
    () => ["DOCENTE", "ADMINISTRADOR"].includes(effectiveRole),
    [effectiveRole]
  );
  const canEditSolicitudAssistance = useMemo(
    () => ["DOCENTE", "ADMINISTRADOR"].includes(effectiveRole),
    [effectiveRole]
  );
  const canDelegateSolicitudResponsable = useMemo(
    () => effectiveRole === "ADMINISTRADOR",
    [effectiveRole]
  );
  const selectedZoomPastMonthsBack = useMemo(() => {
    const selectedOption = zoomPastMonthOptions.find(
      (option) => option.value === selectedZoomPastMonthKey
    );
    return selectedOption?.monthsBack ?? DEFAULT_ZOOM_PAST_MONTHS_BACK;
  }, [selectedZoomPastMonthKey, zoomPastMonthOptions]);
  const docenteLinkedEmailOptions = useMemo(
    () => resolveUserAccessEmails(user),
    [user]
  );
  const requesterDisplayName = useMemo(() => {
    if (!user) return "";
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return fullName || user.email || "";
  }, [user]);
  const responsableOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }>();

    const addOption = (firstName: string | null | undefined, lastName: string | null | undefined, email: string) => {
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) return;
      const value = fullName ? `${fullName} (${normalizedEmail})` : normalizedEmail;
      const key = `${fullName.toLowerCase()}|${normalizedEmail}`;
      if (map.has(key)) return;
      const label = fullName ? `${fullName} (${normalizedEmail})` : normalizedEmail;
      map.set(key, { value, label });
    };

    const addOptionsForPerson = (
      firstName: string | null | undefined,
      lastName: string | null | undefined,
      primaryEmail: string | null | undefined,
      emails: string[] | null | undefined
    ) => {
      const normalizedEmails = new Set<string>();
      if (primaryEmail) {
        const normalizedPrimary = primaryEmail.trim().toLowerCase();
        if (normalizedPrimary) normalizedEmails.add(normalizedPrimary);
      }
      for (const alias of emails ?? []) {
        const normalizedAlias = alias.trim().toLowerCase();
        if (!normalizedAlias) continue;
        normalizedEmails.add(normalizedAlias);
      }
      for (const email of normalizedEmails) {
        addOption(firstName, lastName, email);
      }
    };

    for (const managedUser of users) {
      if (!["DOCENTE", "ADMINISTRADOR"].includes(managedUser.role)) continue;
      addOptionsForPerson(
        managedUser.firstName,
        managedUser.lastName,
        managedUser.email,
        managedUser.emails
      );
    }

    addOptionsForPerson(user?.firstName, user?.lastName, user?.email, user?.emails);

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
      const candidateEmails = new Set<string>([
        managedUser.email,
        ...(managedUser.emails ?? [])
      ]);
      for (const candidateEmail of candidateEmails) {
        addDocente(
          candidateEmail,
          managedUser.firstName,
          managedUser.lastName,
          null
        );
      }
    }

    const currentUserEmails = new Set<string>([user?.email ?? "", ...(user?.emails ?? [])]);
    for (const candidateEmail of currentUserEmails) {
      addDocente(candidateEmail, user?.firstName, user?.lastName, null);
    }

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
      const candidateEmails = new Set<string>([
        managedUser.email,
        ...(managedUser.emails ?? [])
      ]);
      for (const candidateEmail of candidateEmails) {
        addMonitor(candidateEmail, managedUser.firstName, managedUser.lastName);
      }
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
  const manualMeetingOptionsByAccountId = useMemo<Record<string, ManualMeetingOption[]>>(() => {
    const byAccountId: Record<string, ManualMeetingOption[]> = {};
    for (const account of zoomAccounts) {
      const byMeetingId = new Map<
        string,
        {
          zoomMeetingId: string;
          zoomJoinUrl?: string;
          topic: string;
          firstStartTime: string;
          instancesCount: number;
        }
      >();

      for (const event of account.pendingEvents) {
        const zoomMeetingId = (event.meetingId ?? "").trim();
        if (!zoomMeetingId) continue;

        const existing = byMeetingId.get(zoomMeetingId);
        if (existing) {
          existing.instancesCount += 1;
          continue;
        }

        byMeetingId.set(zoomMeetingId, {
          zoomMeetingId,
          zoomJoinUrl: event.joinUrl || undefined,
          topic: event.topic || "Sin titulo",
          firstStartTime: event.startTime,
          instancesCount: 1
        });
      }

      const options = Array.from(byMeetingId.values()).map((meeting) => ({
        id: meeting.zoomMeetingId,
        zoomMeetingId: meeting.zoomMeetingId,
        zoomJoinUrl: meeting.zoomJoinUrl,
        label:
          meeting.instancesCount > 1
            ? `ID ${meeting.zoomMeetingId} | ${meeting.topic} | ${meeting.instancesCount} instancias`
            : `ID ${meeting.zoomMeetingId} | ${meeting.topic} | ${formatDateTime(meeting.firstStartTime)}`
      }));

      byAccountId[account.id] = options;
    }
    return byAccountId;
  }, [zoomAccounts]);

  const isGlobalBusy = useMemo(
    () =>
      loading ||
      isSubmittingSolicitud ||
      Boolean(deletingSolicitudId) ||
      Boolean(cancellingSerieSolicitudId) ||
      Boolean(cancellingInstanciaKey) ||
      Boolean(restoringInstanciaKey) ||
      Boolean(updatingAsistenciaSolicitudId) ||
      Boolean(updatingAsistenciaInstanciaKey),
    [
      loading,
      isSubmittingSolicitud,
      deletingSolicitudId,
      cancellingSerieSolicitudId,
      cancellingInstanciaKey,
      restoringInstanciaKey,
      updatingAsistenciaSolicitudId,
      updatingAsistenciaInstanciaKey
    ]
  );

  const activeBusyOperation = useMemo<BusyOperationKey>(() => {
    if (loading) return "BOOTSTRAP";
    if (isSubmittingSolicitud) return "SUBMIT_SOLICITUD";
    if (deletingSolicitudId) return "DELETE_SOLICITUD";
    if (cancellingSerieSolicitudId) return "CANCEL_SERIE";
    if (cancellingInstanciaKey) return "CANCEL_INSTANCIA";
    if (restoringInstanciaKey) return "RESTORE_INSTANCIA";
    if (updatingAsistenciaSolicitudId || updatingAsistenciaInstanciaKey) return "UPDATE_ASISTENCIA";
    return "GENERIC";
  }, [
    loading,
    isSubmittingSolicitud,
    deletingSolicitudId,
    cancellingSerieSolicitudId,
    cancellingInstanciaKey,
    restoringInstanciaKey,
    updatingAsistenciaSolicitudId,
    updatingAsistenciaInstanciaKey
  ]);
  const [busyMessageIndex, setBusyMessageIndex] = useState(0);
  const busyMessageSequence = useMemo(
    () => BUSY_MESSAGES[activeBusyOperation] ?? BUSY_MESSAGES.GENERIC,
    [activeBusyOperation]
  );
  const globalBusyLabel = useMemo(
    () => busyMessageSequence[busyMessageIndex] ?? busyMessageSequence[0] ?? "Procesando...",
    [busyMessageSequence, busyMessageIndex]
  );

  useEffect(() => {
    setBusyMessageIndex(0);
    if (!isGlobalBusy) return;
    if (busyMessageSequence.length <= 1) return;

    const intervalId = window.setInterval(() => {
      setBusyMessageIndex((prev) => (prev + 1) % busyMessageSequence.length);
    }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isGlobalBusy, busyMessageSequence]);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    try {
      const meRes = await fetch("/api/v1/auth/me", { cache: "no-store" });
      const meJson = (await readJsonSafe<{ user?: CurrentUser; error?: string }>(meRes)) ?? {};
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
      const presentationRole = resolveEffectiveRoleForUser(meJson.user.role);
      if (!requestedTab) {
        setTab(getDefaultTabForRole(presentationRole || "ADMINISTRADOR"));
      }

      const loaders: Array<Promise<void>> = [
        (async () => {
          const summary = await loadSummary();
          if (summary) setSummary(summary);
        })()
      ];

      if (presentationRole === "ADMINISTRADOR") {
        loaders.push(
          (async () => {
            const pendings = await loadManualPendings();
            if (pendings) setManualPendings(pendings);
          })()
        );
      }

      if (["ADMINISTRADOR", "CONTADURIA"].includes(presentationRole)) {
        loaders.push(
          (async () => {
            const tarifas = await loadTarifas();
            if (tarifas) setTarifas(tarifas);
          })()
        );
      }

      if (["DOCENTE", "ADMINISTRADOR"].includes(presentationRole)) {
        loaders.push(
          (async () => {
            const loadedProgramas = await loadProgramas();
            if (loadedProgramas) setProgramas(loadedProgramas);
          })()
        );
      }

      if (["DOCENTE", "ADMINISTRADOR"].includes(presentationRole)) {
        loaders.push(
          (async () => {
            setIsLoadingSolicitudes(true);
            try {
              const solicitudes = await loadSolicitudes();
              if (solicitudes) setSolicitudes(solicitudes);
            } finally {
              setIsLoadingSolicitudes(false);
            }
          })()
        );
      }

      if (presentationRole === "ADMINISTRADOR") {
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

      if (presentationRole === "ASISTENTE_ZOOM") {
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
    setTab(getDefaultTabForRole(effectiveRole));
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
    if (docenteLinkedEmailOptions.length === 0) return;
    setForm((prev) => {
      const current = prev.correoVinculado.trim().toLowerCase();
      if (current && docenteLinkedEmailOptions.includes(current)) {
        return prev;
      }
      return {
        ...prev,
        correoVinculado: docenteLinkedEmailOptions[0] ?? ""
      };
    });
  }, [docenteLinkedEmailOptions, setForm]);

  useEffect(() => {
    if (tab !== "perfil" || !user) return;
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
  }, [tab, user?.id]);

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
    void refreshZoomPastMeetings(selectedZoomPastMonthsBack);
  }, [tab, canSeeZoomAccounts, selectedZoomPastMonthsBack]);

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
    if (tab !== "asistentes_asignacion" || !canSeeAsistentesAsignacion) return;
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
  }, [tab, canSeeAsistentesAsignacion]);

  useEffect(() => {
    if (tab !== "historico" || !canSeePastMeetings) return;
    void refreshPastMeetings();
  }, [tab, canSeePastMeetings]);

  useEffect(() => {
    if (!requestedTab) return;
    setTab(requestedTab);
  }, [requestedTab]);

  async function refreshSummary() {
    setIsLoadingSummary(true);
    try {
      const data = await loadSummary();
      if (data) setSummary(data);
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function refreshManualPendings() {
    const pendings = await loadManualPendings();
    if (!pendings) {
      setMessage("No se pudieron cargar los pendientes manuales.");
      return;
    }
    setManualPendings(pendings);
  }

  async function refreshAfterSolicitudMutation() {
    setIsLoadingSolicitudes(true);
    try {
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
    } finally {
      setIsLoadingSolicitudes(false);
    }
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
      const data = (await readJsonSafe<{ error?: string }>(response)) ?? {};
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

      const linkedDocenteEmail = form.correoVinculado.trim().toLowerCase();
      if (!linkedDocenteEmail) {
        setMessage("Debes seleccionar el correo vinculado de la reunion.");
        return;
      }
      if (!docenteLinkedEmailOptions.includes(linkedDocenteEmail)) {
        setMessage("El correo vinculado debe pertenecer a tu cuenta.");
        return;
      }

      const normalizedAdditionalDocenteCopies = normalizeDocentesCorreosByLine(form.correosDocentes);
      const normalizedDocentesCorreos = Array.from(
        new Set([
          linkedDocenteEmail,
          ...(normalizedAdditionalDocenteCopies
            ? normalizedAdditionalDocenteCopies.split("\n").filter(Boolean)
            : [])
        ])
      ).join("\n");
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

  async function restoreSolicitudInstancia(input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    startTime: string;
  }) {
    const instanceDateLabel = formatDateTime(input.startTime);
    if (
      !window.confirm(
        `Se descancelara la instancia ${instanceDateLabel} de "${input.titulo}" y se sincronizara Zoom con lo registrado en la app. ¿Continuar?`
      )
    ) {
      return;
    }

    const instanceKey = `${input.solicitudId}:${input.eventoId ?? input.startTime}`;
    setRestoringInstanciaKey(instanceKey);
    setMessage("");

    try {
      const response = await restoreSolicitudInstanciaApi({
        solicitudId: input.solicitudId,
        eventoId: input.eventoId ?? undefined,
        inicioProgramadoAt: input.startTime
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo descancelar la instancia.");
        return;
      }

      const source = response.result?.source ?? "";
      const sourceLabel =
        source === "RECURRENCIA_PRINCIPAL"
          ? "recurrencia principal"
          : source === "MEETING_DEDICADO_EXISTENTE"
            ? "meeting dedicado existente"
            : source === "MEETING_DEDICADO"
              ? "meeting dedicado nuevo"
              : "Zoom";
      const meetingIdLabel = response.result?.zoomMeetingId ? ` (${response.result.zoomMeetingId})` : "";
      setMessage(`Instancia descancelada y sincronizada con ${sourceLabel}${meetingIdLabel}.`);
      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo descancelar la instancia.");
    } finally {
      setRestoringInstanciaKey(null);
    }
  }

  async function addSolicitudInstancia(input: {
    solicitudId: string;
    titulo: string;
    inicioProgramadoAt: string;
    finProgramadoAt: string;
  }): Promise<boolean> {
    setMessage("");
    setAddingInstanciaSolicitudId(input.solicitudId);

    try {
      const response = await addSolicitudInstanciaApi({
        solicitudId: input.solicitudId,
        inicioProgramadoAt: input.inicioProgramadoAt,
        finProgramadoAt: input.finProgramadoAt
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo agregar la instancia.");
        return false;
      }

      const usedPrimaryMeeting = response.result?.usaMeetingPrincipal !== false;
      const resolvedMeetingId = (response.result?.zoomMeetingId ?? "").trim();
      if (usedPrimaryMeeting) {
        setMessage(
          resolvedMeetingId
            ? `Instancia agregada en "${input.titulo}" usando el mismo ID (${resolvedMeetingId}).`
            : `Instancia agregada en "${input.titulo}" usando el mismo ID.`
        );
      } else {
        setMessage(
          resolvedMeetingId
            ? `Instancia agregada en "${input.titulo}" con nuevo ID (${resolvedMeetingId}) por superposición de horario.`
            : `Instancia agregada en "${input.titulo}" con nuevo ID por superposición de horario.`
        );
      }
      await refreshAfterSolicitudMutation();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo agregar la instancia.");
      return false;
    } finally {
      setAddingInstanciaSolicitudId(null);
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

  async function enableSolicitudAssistance(input: {
    solicitudId: string;
    titulo: string;
    requiereAsistencia: boolean;
  }) {
    const nextRequiresAssistance = !input.requiereAsistencia;
    const confirmMessage = nextRequiresAssistance
      ? `Se habilitara asistencia Zoom para "${input.titulo}" en sus instancias activas. ¿Continuar?`
      : `Se quitara la asistencia Zoom para "${input.titulo}". Si hay asistentes asignados, recibiran un correo de cancelacion. ¿Continuar?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setMessage("");
    setUpdatingAsistenciaSolicitudId(input.solicitudId);

    try {
      const response = await enableSolicitudAsistenciaApi({
        solicitudId: input.solicitudId,
        requiereAsistencia: nextRequiresAssistance
      });
      if (!response.success) {
        setMessage(
          response.error ??
            (nextRequiresAssistance
              ? "No se pudo habilitar asistencia Zoom."
              : "No se pudo deshabilitar asistencia Zoom.")
        );
        return;
      }

      if (nextRequiresAssistance) {
        if (response.alreadyEnabled) {
          setMessage("La solicitud ya tenia asistencia Zoom habilitada.");
        } else {
          const updatedCount = response.updatedEvents ?? 0;
          setMessage(
            updatedCount > 0
              ? `Asistencia Zoom habilitada. Se actualizaron ${updatedCount} instancia(s).`
              : "Asistencia Zoom habilitada."
          );
        }
      } else if (response.alreadyDisabled) {
        setMessage("La solicitud ya tenia asistencia Zoom deshabilitada.");
      } else {
        const updatedCount = response.updatedEvents ?? 0;
        const cancelledAssignments = response.cancelledAssignments ?? 0;
        const notifiedAssistants = response.notifiedAssistants ?? 0;
        const details = [
          `instancia(s) actualizadas: ${updatedCount}`,
          `asignacion(es) canceladas: ${cancelledAssignments}`,
          `correo(s) enviados: ${notifiedAssistants}`
        ];
        setMessage(`Asistencia Zoom deshabilitada (${details.join(", ")}).`);
      }

      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : nextRequiresAssistance
            ? "No se pudo habilitar asistencia Zoom."
            : "No se pudo deshabilitar asistencia Zoom."
      );
    } finally {
      setUpdatingAsistenciaSolicitudId(null);
    }
  }

  async function updateSolicitudAssistanceForInstance(input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    startTime: string;
    requiereAsistencia: boolean;
  }) {
    const instanceDateLabel = formatDateTime(input.startTime);
    const confirmMessage = input.requiereAsistencia
      ? `Se habilitara asistencia Zoom solo para la instancia ${instanceDateLabel} de "${input.titulo}". ¿Continuar?`
      : `Se quitara la asistencia Zoom solo para la instancia ${instanceDateLabel} de "${input.titulo}". Si habia una persona asignada recibira correo de cancelacion. ¿Continuar?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const instanceKey = `${input.solicitudId}:${input.eventoId ?? input.startTime}`;
    setMessage("");
    setUpdatingAsistenciaInstanciaKey(instanceKey);

    try {
      const response = await updateSolicitudInstanciaAsistenciaApi({
        solicitudId: input.solicitudId,
        eventoId: input.eventoId ?? undefined,
        inicioProgramadoAt: input.startTime,
        requiereAsistencia: input.requiereAsistencia
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo actualizar asistencia Zoom para la instancia.");
        return;
      }

      if (input.requiereAsistencia) {
        if (response.alreadyEnabled) {
          setMessage("La instancia ya tenia asistencia Zoom habilitada.");
        } else {
          setMessage(`Asistencia Zoom habilitada para la instancia ${instanceDateLabel}.`);
        }
      } else {
        if (response.alreadyDisabled) {
          setMessage("La instancia ya tenia asistencia Zoom deshabilitada.");
        } else {
          const cancelledAssignments = response.cancelledAssignments ?? 0;
          const notifiedAssistants = response.notifiedAssistants ?? 0;
          setMessage(
            `Asistencia Zoom deshabilitada para la instancia ${instanceDateLabel} (asignaciones canceladas: ${cancelledAssignments}, correos enviados: ${notifiedAssistants}).`
          );
        }
      }

      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo habilitar asistencia Zoom para la instancia."
      );
    } finally {
      setUpdatingAsistenciaInstanciaKey(null);
    }
  }

  async function disableSolicitudAssistanceForInstance(input: {
    solicitudId: string;
    titulo: string;
    eventoId?: string | null;
    startTime: string;
  }) {
    const instanceDateLabel = formatDateTime(input.startTime);
    const confirmMessage =
      `Se quitara la asistencia Zoom solo para la instancia ${instanceDateLabel} de "${input.titulo}". Si habia una persona asignada recibira correo de cancelacion. ¿Continuar?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const instanceKey = `${input.solicitudId}:${input.eventoId ?? input.startTime}`;
    setMessage("");
    setUpdatingAsistenciaInstanciaKey(instanceKey);

    try {
      const response = await updateSolicitudInstanciaAsistenciaApi({
        solicitudId: input.solicitudId,
        eventoId: input.eventoId ?? undefined,
        inicioProgramadoAt: input.startTime,
        requiereAsistencia: false
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo deshabilitar asistencia Zoom para la instancia.");
        return;
      }

      if (response.alreadyDisabled) {
        setMessage("La instancia ya tenia asistencia Zoom deshabilitada.");
      } else {
        const cancelledAssignments = response.cancelledAssignments ?? 0;
        const notifiedAssistants = response.notifiedAssistants ?? 0;
        setMessage(
          `Asistencia Zoom deshabilitada para la instancia ${instanceDateLabel} (asignaciones canceladas: ${cancelledAssignments}, correos enviados: ${notifiedAssistants}).`
        );
      }

      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo deshabilitar asistencia Zoom para la instancia."
      );
    } finally {
      setUpdatingAsistenciaInstanciaKey(null);
    }
  }

  async function setInterest(eventoId: string, estadoInteres: "ME_INTERESA" | "NO_ME_INTERESA" | "RETIRADO") {
    setUpdatingInterestId(eventoId);
    const previousAgenda = agendaLibre;
    const optimisticAnsweredAt = new Date().toISOString();
    setAgendaLibre((current) =>
      current.map((event) => {
        if (event.id !== eventoId) return event;
        return {
          ...event,
          intereses: [
            {
              id: event.intereses[0]?.id ?? `temp-${eventoId}`,
              estadoInteres,
              fechaRespuestaAt: optimisticAnsweredAt
            }
          ]
        };
      })
    );

    try {
      const response = await setInterestApi(eventoId, estadoInteres);
      if (!response.success) {
        setAgendaLibre(previousAgenda);
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
    } catch (error) {
      setAgendaLibre(previousAgenda);
      setMessage(error instanceof Error ? error.message : "No se pudo registrar interés.");
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

  async function removeAssistanceFromAssignmentEvent(input: {
    eventoId: string;
    solicitudId: string;
    titulo: string;
    inicioProgramadoAt: string;
  }) {
    const instanceDateLabel = formatDateTime(input.inicioProgramadoAt);
    const confirmMessage =
      `Se quitara la asistencia Zoom para la reunion ${instanceDateLabel} de "${input.titulo}". Si hay una persona asignada se notificara la cancelacion. ¿Continuar?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setRemovingAssistanceAssignmentEventId(input.eventoId);
    setMessage("");
    try {
      const response = await updateSolicitudInstanciaAsistenciaApi({
        solicitudId: input.solicitudId,
        eventoId: input.eventoId,
        requiereAsistencia: false
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo quitar asistencia de la reunion.");
        return;
      }

      if (response.alreadyDisabled) {
        setMessage("La reunion ya no requeria asistencia.");
      } else {
        const cancelledAssignments = response.cancelledAssignments ?? 0;
        const notifiedAssistants = response.notifiedAssistants ?? 0;
        setMessage(
          `Asistencia removida para la reunion ${instanceDateLabel} (asignaciones canceladas: ${cancelledAssignments}, correos enviados: ${notifiedAssistants}).`
        );
      }

      await refreshAfterSolicitudMutation();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo quitar asistencia de la reunion.");
    } finally {
      setRemovingAssistanceAssignmentEventId(null);
    }
  }

  async function onUnassignAssistantFromEvent(eventoId: string) {
    if (!window.confirm("¿Deseas quitar a la persona asignada? El requerimiento de asistencia se mantendrá y la reunión volverá a Pendientes.")) {
      return;
    }

    setRemovingAssistanceAssignmentEventId(eventoId);
    try {
      const response = await unassignAssistantFromEventApi(eventoId);
      if (!response.success) {
        setMessage(response.error ?? "No se pudo desasignar asistencia.");
        return;
      }

      setMessage("Asistente desasignado. La reunión volvió a Pendientes.");
      await Promise.all([loadAssignmentBoard(), loadSummary()]).then(([assignmentData, summaryData]) => {
        if (assignmentData) {
          setAssignmentBoardEvents(assignmentData.events ?? []);
          setAssignableAssistants(assignmentData.assistants ?? []);
        }
        if (summaryData) setSummary(summaryData);
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo desasignar asistencia.");
    } finally {
      setRemovingAssistanceAssignmentEventId(null);
    }
  }

  function applySuggestionSelection(suggestion: AssignmentSuggestion | null) {
    if (!suggestion) return;
    setSelectedAssistantByEvent((current) => {
      const next = { ...current };
      for (const event of suggestion.events) {
        next[event.eventoId] = event.asistenteZoomId ?? "";
      }
      return next;
    });
  }

  async function suggestMonthlyAssignment() {
    setIsLoadingSuggestion(true);
    try {
      const response = await loadAssignmentSuggestion();
      if (!response) {
        setMessage("No se pudo generar sugerencias de asignación.");
        return;
      }

      setSuggestionSessionId(response.sessionId);
      setAssignmentSuggestion(response.suggestion ?? null);

      if (!response.suggestion) {
        setMessage(response.message ?? "No se encontró una sugerencia válida para los eventos pendientes.");
        return;
      }
      setMessage(
        `Sugerencia generada (alcance ${response.scopeKey}). Puntaje: ${response.suggestion.score.toFixed(2)}. Revisa y aplica por reunion.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar sugerencias de asignación.");
    } finally {
      setIsLoadingSuggestion(false);
    }
  }

  async function suggestNextMonthlyAssignment() {
    if (!suggestionSessionId) {
      setMessage("Primero debes generar una sugerencia inicial.");
      return;
    }

    setIsLoadingSuggestion(true);
    try {
      const response = await loadNextAssignmentSuggestion(suggestionSessionId);
      if (!response) {
        setMessage("No se pudo obtener la siguiente sugerencia.");
        return;
      }

      setSuggestionSessionId(response.sessionId);
      setAssignmentSuggestion(response.suggestion ?? null);

      if (!response.suggestion) {
        setMessage(response.message ?? "No hay más sugerencias equivalentes disponibles.");
        return;
      }
      setMessage(`Alternativa lista. Puntaje: ${response.suggestion.score.toFixed(2)}. Revisa y aplica por reunion.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo obtener la siguiente sugerencia.");
    } finally {
      setIsLoadingSuggestion(false);
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
      const parsedEmails = parseEmailLines(createUserForm.emails);
      if (parsedEmails.length === 0) {
        setMessage("Debes indicar al menos un correo de acceso.");
        return;
      }

      const response = await submitCreateUserApi({
        firstName: createUserForm.firstName,
        lastName: createUserForm.lastName,
        emails: parsedEmails,
        role: createUserForm.role
      });

      if (!response.success) {
        setMessage(response.error ?? "No se pudo crear el usuario.");
        return;
      }

      setCreateUserForm((prev) => ({
        ...prev,
        emails: "",
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

  async function updateUserRole(userId: string, role: string, emails: string[]) {
    setMessage("");
    setUpdatingUserId(userId);
    try {
      const normalizedEmails = parseEmailLines(emails.join("\n"));
      if (normalizedEmails.length === 0) {
        setMessage("Debes indicar al menos un correo de acceso.");
        return;
      }

      const response = await submitUpdateUserRoleApi({ userId, role, emails: normalizedEmails });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo actualizar el usuario.");
        return;
      }

      const users = await loadUsers();
      if (users) setUsers(users);
      setMessage("Usuario actualizado correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el usuario.");
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

  async function registerUpcomingMeetingInSystem(input: {
    meeting: ZoomUpcomingMeeting;
    responsableNombre: string;
    programaNombre: string;
    modalidadReunion: "VIRTUAL" | "HIBRIDA";
    requiereAsistencia: boolean;
    descripcion?: string;
  }): Promise<boolean> {
    setMessage("");
    setIsRegisteringUpcomingMeeting(true);
    try {
      const response = await registerUpcomingMeetingInSystemApi({
        titulo: input.meeting.topic || "Sin titulo",
        responsableNombre: input.responsableNombre,
        programaNombre: input.programaNombre,
        modalidadReunion: input.modalidadReunion,
        inicioProgramadoAt: input.meeting.startTime,
        finProgramadoAt: input.meeting.endTime,
        timezone: input.meeting.timezone || "America/Montevideo",
        zoomMeetingId: input.meeting.meetingId ?? undefined,
        zoomJoinUrl: input.meeting.joinUrl || undefined,
        zoomAccountId: input.meeting.accountId || undefined,
        zoomAccountEmail: input.meeting.accountEmail || undefined,
        requiereAsistencia: input.requiereAsistencia,
        descripcion: input.descripcion
      });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo registrar la reunion en sistema.");
        return false;
      }

      setMessage("Reunion registrada en sistema correctamente.");
      await Promise.all([refreshAfterSolicitudMutation(), refreshZoomUpcomingMeetings()]);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar la reunion en sistema.");
      return false;
    } finally {
      setIsRegisteringUpcomingMeeting(false);
    }
  }

  async function refreshZoomPastMeetings(monthsBack = selectedZoomPastMonthsBack) {
    setIsLoadingZoomPastMeetings(true);
    try {
      const result = await loadZoomPastMeetings({ monthsBack });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setZoomGroupName(result.groupName);
      setZoomPastMeetings(result.meetings);
    } finally {
      setIsLoadingZoomPastMeetings(false);
    }
  }

  function selectZoomPastMonth(monthKey: string) {
    setSelectedZoomPastMonthKey(monthKey);
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

  async function updatePastMeetingRecord(input: {
    eventoId: string;
    programaNombre: string;
    monitorEmail?: string;
  }): Promise<boolean> {
    setMessage("");
    setUpdatingPastMeetingId(input.eventoId);
    try {
      const response = await updatePastMeetingApi({
        eventoId: input.eventoId,
        programaNombre: input.programaNombre,
        monitorEmail: input.monitorEmail
      });
      if (!response.success) {
        setMessage(response.error ?? "No se pudo actualizar la reunion.");
        return false;
      }

      const meetings = await loadPastMeetings();
      if (!meetings) {
        setMessage("Reunion actualizada, pero no se pudo refrescar la lista.");
        return true;
      }
      setPastMeetings(meetings);
      setMessage("Reunion actualizada correctamente.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar la reunion.");
      return false;
    } finally {
      setUpdatingPastMeetingId(null);
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

  return (
    <Box component="section">
      {tab === "dashboard" && (
        <SpaTabDashboard
          summary={summary}
          isLoadingSummary={isLoadingSummary}
          onRefresh={refreshSummary}
          role={effectiveRole || "ADMINISTRADOR"}
          agendaLibre={agendaLibre}
          onGoToCreateMeeting={() => {
            setTab("crear_reunion");
          }}
          onGoToAssignAssistants={() => {
            setTab("asistentes_asignacion");
          }}
          onGoToAgendaAvailable={() => {
            setTab("agenda_libre");
          }}
          onGoToMyAssignedMeetings={() => {
            setTab("mis_reuniones_asignadas");
          }}
        />
      )}

      {tab === "notificaciones" && canSeeNotificaciones && (
        <SpaTabNotificaciones isAdmin={effectiveRole === "ADMINISTRADOR"} />
      )}

      {tab === "crear_reunion" && canSeeSolicitudes && (
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
          onRestoreSolicitudInstancia={restoreSolicitudInstancia}
          restoringInstanciaKey={restoringInstanciaKey}
          canAddInstances={canEditSolicitudAssistance}
          addingInstanceSolicitudId={addingInstanciaSolicitudId}
          onAddInstance={addSolicitudInstancia}
          canSendReminder={canSendSolicitudReminder}
          sendingReminderSolicitudId={sendingReminderSolicitudId}
          onSendReminder={sendSolicitudReminder}
          canEditAssistance={canEditSolicitudAssistance}
          updatingAssistanceSolicitudId={updatingAsistenciaSolicitudId}
          updatingAssistanceInstanceKey={updatingAsistenciaInstanciaKey}
          onEnableAssistance={enableSolicitudAssistance}
          onToggleAssistanceForInstance={updateSolicitudAssistanceForInstance}
          canDeleteSolicitud={canCreateSolicitudShortcut}
          canRestoreInstances={canEditSolicitudAssistance}
          isSubmittingSolicitud={isSubmittingSolicitud}
          canCreateShortcut={canCreateSolicitudShortcut}
          canDelegateResponsable={canDelegateSolicitudResponsable}
          responsableOptions={responsableOptions}
          docenteLinkedEmailOptions={docenteLinkedEmailOptions}
          programaOptions={programaOptions}
          isCreatingPrograma={isCreatingPrograma}
          onCreatePrograma={createProgramaOnDemand}
          docenteSolicitudesView="form"
          setDocenteSolicitudesView={() => {}}
          viewerRole={effectiveRole}
          onSubmit={submitDocenteSolicitud}
          isLoading={isLoadingSolicitudes}
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
          onRestoreSolicitudInstancia={restoreSolicitudInstancia}
          restoringInstanciaKey={restoringInstanciaKey}
          canAddInstances={canEditSolicitudAssistance}
          addingInstanceSolicitudId={addingInstanciaSolicitudId}
          onAddInstance={addSolicitudInstancia}
          canSendReminder={canSendSolicitudReminder}
          sendingReminderSolicitudId={sendingReminderSolicitudId}
          onSendReminder={sendSolicitudReminder}
          canEditAssistance={canEditSolicitudAssistance}
          updatingAssistanceSolicitudId={updatingAsistenciaSolicitudId}
          updatingAssistanceInstanceKey={updatingAsistenciaInstanciaKey}
          onEnableAssistance={enableSolicitudAssistance}
          onToggleAssistanceForInstance={updateSolicitudAssistanceForInstance}
          canDeleteSolicitud={canCreateSolicitudShortcut}
          canRestoreInstances={canEditSolicitudAssistance}
          isSubmittingSolicitud={isSubmittingSolicitud}
          canCreateShortcut={canCreateSolicitudShortcut}
          canDelegateResponsable={canDelegateSolicitudResponsable}
          responsableOptions={responsableOptions}
          docenteLinkedEmailOptions={docenteLinkedEmailOptions}
          programaOptions={programaOptions}
          isCreatingPrograma={isCreatingPrograma}
          onCreatePrograma={createProgramaOnDemand}
          docenteSolicitudesView="list"
          setDocenteSolicitudesView={() => {}}
          viewerRole={effectiveRole}
          onSubmit={submitDocenteSolicitud}
          isLoading={isLoadingSolicitudes}
        />
      )}

      {tab === "programas" && canSeeProgramas && (
        <SpaTabProgramas
          role={effectiveRole || "ADMINISTRADOR"}
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

      {tab === "historico_asistencias" && canSeeHistoricoAsistencias && user?.id && (
        <SpaTabHistoricoAsistencias userId={user.id} role={effectiveRole || "ADMINISTRADOR"} />
      )}

      {tab === "mis_reuniones_asignadas" && canSeeMisReunionesAsignadas && user?.id && (
        <SpaTabMisReunionesAsignadas userId={user.id} role={effectiveRole || "ADMINISTRADOR"} />
      )}


      {tab === "manual" && canSeeManual && (
        <SpaTabManual
          manualPendings={manualPendings}
          accountOptions={manualAccountOptions}
          meetingOptionsByAccountId={manualMeetingOptionsByAccountId}
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
          updatingPastMeetingId={updatingPastMeetingId}
          onRefreshPastMeetings={() => {
            void refreshPastMeetings();
          }}
          onUpdatePastMeeting={updatePastMeetingRecord}
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

      {(tab === "asistentes_asignacion" || tab === "asistentes_perfiles" || tab === "asistentes_estadisticas") && canSeeGestionAsistentes && (
        <SpaTabGestionAsistentes 
          activeSubTab={
            tab === "asistentes_asignacion" ? 0 : 
            tab === "asistentes_perfiles" ? 1 : 2
          }
          onTabChange={(index) => {
            if (index === 0) setTab("asistentes_asignacion");
            else if (index === 1) setTab("asistentes_perfiles");
            else if (index === 2) setTab("asistentes_estadisticas");
          }}
          assignmentBoardEvents={assignmentBoardEvents}
          assignableAssistants={assignableAssistants}
          isLoadingAssignmentBoard={isLoadingAssignmentBoard}
          assignmentSuggestion={assignmentSuggestion}
          isLoadingSuggestion={isLoadingSuggestion}
          hasSuggestionSession={Boolean(suggestionSessionId)}
          assigningEventId={assigningEventId}
          removingAssistanceEventId={removingAssistanceAssignmentEventId}
          selectedAssistantByEvent={selectedAssistantByEvent}
          onSelectedAssistantChange={(eventId, assistantId) =>
            setSelectedAssistantByEvent((prev) => ({ ...prev, [eventId]: assistantId }))
          }
          onAssignAssistant={assignAssistantToEvent}
          onRemoveAssistanceForEvent={removeAssistanceFromAssignmentEvent}
          onSuggestMonthly={suggestMonthlyAssignment}
          onSuggestNext={suggestNextMonthlyAssignment}
          onUnassignAssistant={onUnassignAssistantFromEvent}
          onDownloadReport={async () => {
            const result = await downloadMonthlyAccountingReport();
            if (!result.success && result.error) {
              setMessage(result.error);
            }
          }}
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
          showHoursPanel={effectiveRole !== "CONTADURIA"}
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
          onRegisterUpcomingMeeting={registerUpcomingMeetingInSystem}
          isRegisteringUpcomingMeeting={isRegisteringUpcomingMeeting}
          programaOptions={programaOptions}
          responsableOptions={responsableOptions}
          defaultResponsableNombre={requesterDisplayName}
        />
      )}

      {tab === "pasadas_zoom" && canSeeZoomAccounts && (
        <SpaTabPasadasReunionesZoom
          groupName={zoomGroupName}
          meetings={zoomPastMeetings}
          isLoading={isLoadingZoomPastMeetings}
          onRefresh={() => {
            void refreshZoomPastMeetings(selectedZoomPastMonthsBack);
          }}
          monthOptions={zoomPastMonthOptions}
          selectedMonthKey={selectedZoomPastMonthKey}
          onSelectMonthKey={selectZoomPastMonth}
          onCreatePostMeetingRecord={preloadPastMeetingFormFromZoom}
        />
      )}

      {tab === "zoom_drive_sync" && canSeeZoomDriveSync && (
        <SpaTabZoomDriveSync />
      )}

      {String(tab) === "estadisticas" && canSeeEstadisticas && (
        <SpaTabEstadisticas />
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
          isUpdatingPassword={isUpdatingPassword}
          passwordForm={passwordForm}
          setPasswordForm={setPasswordForm}
          showPasswordForm={showPasswordForm}
          setShowPasswordForm={setShowPasswordForm}
          onLinkGoogleAccount={linkGoogleAccount}
          onUnlinkGoogleAccount={unlinkGoogleAccount}
          onSyncProfileFromGoogle={syncProfileFromGoogle}
          onSubmitPassword={async (e) => {
            e.preventDefault();
            if (passwordForm.newPassword !== passwordForm.confirmPassword) {
              setMessage("Las contraseñas no coinciden.");
              return;
            }
            setIsUpdatingPassword(true);
            setMessage("");
            try {
              const result = await updatePasswordApi(passwordForm.newPassword);
              if (!result.success) {
                setMessage(result.error ?? "No se pudo actualizar la contraseña.");
                return;
              }
              setHasPassword(true);
              setMessage("Contraseña establecida correctamente. Ya puedes ingresar con tu email.");
              setShowPasswordForm(false);
              setPasswordForm({ newPassword: "", confirmPassword: "" });
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Error al actualizar contraseña.");
            } finally {
              setIsUpdatingPassword(false);
            }
          }}
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
              const data =
                (await readJsonSafe<{ error?: string; user?: CurrentUser }>(response)) ?? {};
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
          severity={resolveSnackbarSeverity(message)}
          variant="filled"
          onClose={() => setMessage("")}
          sx={{
            width: "100%",
            alignItems: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            borderRadius: 2
          }}
        >
          {message}
        </Alert>
      </Snackbar>

      <Fade in={isGlobalBusy}>
        <LinearProgress
          sx={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: (theme) => theme.zIndex.modal + 20,
            height: 3,
            backgroundColor: "transparent",
            "& .MuiLinearProgress-bar": {
              background: "linear-gradient(90deg, #1f4b8f, #f9b503)"
            }
          }}
        />
      </Fade>

      <Backdrop
        open={isGlobalBusy}
        sx={{
          zIndex: (theme) => theme.zIndex.modal + 10,
          color: "#fff",
          backdropFilter: "blur(6px)",
          backgroundColor: "rgba(31, 75, 143, 0.15)",
          display: "flex",
          flexDirection: "column",
          gap: 3
        }}
      >
        <Box sx={{ position: "relative", display: "inline-flex" }}>
          <CircularProgress 
            size={64} 
            thickness={2} 
            sx={{ color: "primary.main", opacity: 0.3 }} 
          />
          <CircularProgress
            size={64}
            thickness={4}
            sx={{
              color: "primary.main",
              position: "absolute",
              left: 0,
              animationDuration: "800ms",
              [`& .MuiCircularProgress-circle`]: {
                strokeLinecap: "round",
              },
            }}
          />
        </Box>
        <Stack spacing={1} alignItems="center">
          <Typography variant="h6" sx={{ color: "primary.main", fontWeight: 800, textShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
            {globalBusyLabel}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Por favor, espera un momento
          </Typography>
        </Stack>
      </Backdrop>
    </Box>
  );
}
