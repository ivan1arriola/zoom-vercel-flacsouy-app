"use client";

import { useSearchParams } from "next/navigation";
import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
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
  submitPastMeeting as submitPastMeetingApi,
  type Solicitud
} from "@/src/services/solicitudesApi";
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

function normalizeSupportRole(role: string): string {
  if (role === "ASISTENTE_ZOOM" || role === "SOPORTE_ZOOM") {
    return "SOPORTE_ZOOM";
  }
  return role;
}

export function SpaHome() {
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
  const canUseGoogleByEmail = useMemo(
    () => Boolean(user?.email?.trim().toLowerCase().endsWith("@flacso.edu.uy")),
    [user?.email]
  );

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

  function applySolicitudTemplate(templateId: "DIDYP" | "DAVIA") {
    setForm((prev) => {
      const commonRecurringPatch = {
        unaOVarias: "VARIAS",
        primerDiaRecurrente: templateId === "DIDYP" ? "2026-04-08" : "2026-05-13",
        horaInicioRecurrente: "18:30",
        horaFinRecurrente: "20:30",
        duracionRecurrente: "",
        recurrenciaTipoZoom: "2" as ZoomRecurrenceType,
        recurrenciaIntervalo: "1",
        recurrenciaDiasSemana: "4",
        recurrenciaMensualModo: "DAY_OF_MONTH" as ZoomMonthlyMode,
        recurrenciaDiaMes: "1",
        recurrenciaSemanaMes: "1",
        recurrenciaDiaSemanaMes: "2",
        fechaFinal: templateId === "DIDYP" ? "2026-07-29" : "2026-07-15"
      };

      if (templateId === "DIDYP") {
        return {
          ...prev,
          ...commonRecurringPatch,
          tema: "Clases DIDYP",
          responsable: "DIDYP",
          programa: "DIDYP",
          asistenciaZoom: "NO",
          grabacion: "DEFINIR",
          controlAsistencia: "SI"
        };
      }

      return {
        ...prev,
        ...commonRecurringPatch,
        tema: "Clases DAVIA",
        responsable: "DAVIA",
        programa: "DAVIA"
      };
    });
    setMessage(`Plantilla ${templateId} cargada.`);
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
          docentesCorreos: form.correosDocentes.trim() || undefined,
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
          docentesCorreos: form.correosDocentes.trim() || undefined,
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
              end_date_time: recurrenceEnd.toISOString()
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar la solicitud.");
    } finally {
      setDeletingSolicitudId(null);
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

  return (
    <section>
      <h1 className="title">Herramienta para coordinar salas Zoom</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button className={`${tab === "dashboard" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("dashboard")} type="button">
          <span className="g-icon" aria-hidden="true">dashboard</span>
          Dashboard
        </button>
        <button
          className={`${tab === "solicitudes" ? "btn primary" : "btn ghost"} btn-with-icon`}
          onClick={() => setTab("solicitudes")}
          type="button"
        >
          <span className="g-icon" aria-hidden="true">event_note</span>
          Solicitudes
        </button>
        {canSeeAgendaLibre && (
          <button className={`${tab === "agenda_libre" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("agenda_libre")} type="button">
            <span className="g-icon" aria-hidden="true">calendar_month</span>
            Agenda libre
          </button>
        )}
        {canSeeAssignmentBoard && (
          <button className={`${tab === "asignacion" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("asignacion")} type="button">
            <span className="g-icon" aria-hidden="true">groups</span>
            Asignacion de personal
          </button>
        )}
        {canSeeManual && (
          <button className={`${tab === "manual" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("manual")} type="button">
            <span className="g-icon" aria-hidden="true">build</span>
            Resolución manual
          </button>
        )}
        {canSeePastMeetings && (
          <button className={`${tab === "historico" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("historico")} type="button">
            <span className="g-icon" aria-hidden="true">history</span>
            Reuniones pasadas
          </button>
        )}
        {canSeeZoomAccounts && (
          <button className={`${tab === "cuentas" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("cuentas")} type="button">
            <span className="g-icon" aria-hidden="true">videocam</span>
            Cuentas Zoom
          </button>
        )}
        {canSeeTarifas && (
          <button className={`${tab === "tarifas" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("tarifas")} type="button">
            <span className="g-icon" aria-hidden="true">payments</span>
            Tarifas
          </button>
        )}
        {canSeeUsers && (
          <button className={`${tab === "usuarios" ? "btn primary" : "btn ghost"} btn-with-icon`} onClick={() => setTab("usuarios")} type="button">
            <span className="g-icon" aria-hidden="true">group</span>
            Usuarios
          </button>
        )}
      </div>

      {loading && <p className="muted">Cargando...</p>}

      {tab === "dashboard" && <SpaTabDashboard summary={summary} />}

      {tab === "solicitudes" && (
        <SpaTabSolicitudes
          solicitudes={solicitudes}
          form={form}
          updateForm={updateForm}
          onApplyTemplate={applySolicitudTemplate}
          onDeleteSolicitud={deleteSolicitud}
          deletingSolicitudId={deletingSolicitudId}
          canDeleteSolicitud={canCreateSolicitudShortcut}
          isSubmittingSolicitud={isSubmittingSolicitud}
          canCreateShortcut={canCreateSolicitudShortcut}
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



      {message && (
        <p className="muted" style={{ marginTop: 14 }}>
          {message}
        </p>
      )}
    </section>
  );
}










