import { useState } from "react";
import { DEFAULT_SOLICITUD_FORM, type SolicitudFormState } from "@/src/lib/spa-home/solicitud-form";
import type { Solicitud } from "@/src/services/solicitudesApi";

export function useSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [docenteSolicitudesView, setDocenteSolicitudesView] = useState<"form" | "list">("list");
  const [isSubmittingSolicitud, setIsSubmittingSolicitud] = useState(false);
  const [deletingSolicitudId, setDeletingSolicitudId] = useState<string | null>(null);
  const [cancellingSerieSolicitudId, setCancellingSerieSolicitudId] = useState<string | null>(null);
  const [cancellingInstanciaKey, setCancellingInstanciaKey] = useState<string | null>(null);
  const [restoringInstanciaKey, setRestoringInstanciaKey] = useState<string | null>(null);
  const [sendingReminderSolicitudId, setSendingReminderSolicitudId] = useState<string | null>(null);
   const [form, setForm] = useState<SolicitudFormState>(DEFAULT_SOLICITUD_FORM);
  const [isLoadingSolicitudes, setIsLoadingSolicitudes] = useState(false);

  function updateForm<K extends keyof SolicitudFormState>(key: K, value: SolicitudFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return {
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
  };
}
