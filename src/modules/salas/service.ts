import {
  EstadoCoberturaSoporte,
  EstadoInteresAsistente,
  EstadoSolicitudSala,
  EstadoTarifa,
  MeetingIdEstrategia,
  ModalidadReunion,
  Prisma,
  TipoEventoZoom,
  TipoInstancias,
  TipoNotificacion,
  UserRole
} from "@prisma/client";
import { db } from "@/src/lib/db";
import { env } from "@/src/lib/env";
import type { SessionUser } from "@/src/lib/api-auth";

type InstanceDetailInput = {
  inicioProgramadoAt: string;
};

type InstancePlan = {
  inicio: Date;
  fin: Date;
};

export type CreateSolicitudInput = {
  titulo: string;
  responsableNombre?: string;
  programaNombre?: string;
  descripcion?: string;
  finalidadAcademica?: string;
  modalidadReunion: ModalidadReunion;
  tipoInstancias: TipoInstancias;
  meetingIdEstrategia?: MeetingIdEstrategia;
  fechaInicioSolicitada: string;
  fechaFinSolicitada: string;
  timezone?: string;
  capacidadEstimada?: number;
  controlAsistencia?: boolean;
  docentesCorreos?: string;
  grabacionPreferencia?: "SI" | "NO" | "A_DEFINIR";
  requiereGrabacion?: boolean;
  requiereAsistencia?: boolean;
  motivoAsistencia?: string;
  regimenEncuentros?: string;
  fechaFinRecurrencia?: string;
  patronRecurrencia?: Record<string, unknown>;
  fechasInstancias?: string[];
  instanciasDetalle?: InstanceDetailInput[];
};

function toDate(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field} inválida.`);
  }
  return d;
}

function generateMeetingId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function calculateEstimatedCost(minutes: number, rate: number): Prisma.Decimal {
  return new Prisma.Decimal((minutes / 60) * rate);
}

async function getOrCreateDocente(user: SessionUser) {
  const existing = await db.docente.findUnique({ where: { usuarioId: user.id } });
  if (existing) return existing;
  return db.docente.create({ data: { usuarioId: user.id } });
}

async function getOrCreateAsistente(user: SessionUser) {
  const existing = await db.asistenteZoom.findUnique({ where: { usuarioId: user.id } });
  if (existing) return existing;
  return db.asistenteZoom.create({ data: { usuarioId: user.id } });
}

async function getActiveRate(modality: ModalidadReunion) {
  return db.tarifaAsistenciaGlobal.findFirst({
    where: {
      modalidadReunion: modality,
      estado: EstadoTarifa.ACTIVA
    },
    orderBy: { vigenteDesde: "desc" }
  });
}

async function getOrCreateCuentaZoomDefault() {
  const existing = await db.cuentaZoom.findFirst({
    where: { activa: true },
    orderBy: { prioridad: "asc" }
  });
  if (existing) return existing;

  if (!env.ZOOM_ACCOUNT_ID || !env.ZOOM_CLIENT_ID || !env.ZOOM_CLIENT_SECRET) {
    return null;
  }

  return db.cuentaZoom.create({
    data: {
      nombreCuenta: "Cuenta Zoom principal",
      zoomAccountId: env.ZOOM_ACCOUNT_ID,
      ownerEmail: `zoom-${env.ZOOM_ACCOUNT_ID}@flacso.local`,
      clientId: env.ZOOM_CLIENT_ID,
      clientSecretRef: "env:ZOOM_CLIENT_SECRET",
      activa: true,
      prioridad: 100
    }
  });
}

function buildInstanceDates(input: CreateSolicitudInput): Date[] {
  const start = toDate(input.fechaInicioSolicitada, "fechaInicioSolicitada");

  if (input.tipoInstancias === TipoInstancias.UNICA) {
    return [start];
  }

  if (input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM) {
    const rawDates = input.fechasInstancias ?? [];
    if (rawDates.length < 2) {
      throw new Error("Para MULTIPLE_NO_COMPATIBLE_ZOOM se requieren al menos 2 fechas.");
    }
    return rawDates.map((raw) => toDate(raw, "fechasInstancias"));
  }

  const recurrence = (input.patronRecurrencia ?? {}) as {
    totalInstancias?: number;
    intervaloDias?: number;
  };
  const total = recurrence.totalInstancias ?? 4;
  const interval = recurrence.intervaloDias ?? 7;

  if (total < 2) {
    throw new Error("Para MULTIPLE_COMPATIBLE_ZOOM totalInstancias debe ser >= 2.");
  }

  const dates: Date[] = [];
  for (let i = 0; i < total; i += 1) {
    const next = new Date(start);
    next.setDate(start.getDate() + i * interval);
    dates.push(next);
  }

  return dates;
}

function buildInstancePlans(input: CreateSolicitudInput, durationMinutes: number): InstancePlan[] {
  const details = input.instanciasDetalle ?? [];

  if (details.length > 0) {
    const parsed = details.map((item, index) => {
      const inicio = toDate(item.inicioProgramadoAt, `instanciasDetalle[${index}].inicioProgramadoAt`);
      return {
        inicio,
        fin: new Date(inicio.getTime() + durationMinutes * 60000)
      };
    });

    if (input.tipoInstancias !== TipoInstancias.UNICA && parsed.length < 2) {
      throw new Error("Para reuniones múltiples se requieren al menos 2 instancias en el detalle.");
    }

    const sorted = parsed.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
    const unique = new Set<number>();
    for (const plan of sorted) {
      const key = plan.inicio.getTime();
      if (unique.has(key)) {
        throw new Error("No puede haber instancias repetidas en fecha y hora.");
      }
      unique.add(key);
    }

    return sorted;
  }

  return buildInstanceDates(input).map((inicio) => ({
    inicio,
    fin: new Date(inicio.getTime() + durationMinutes * 60000)
  }));
}

export class SalasService {
  async getDashboardSummary(user: SessionUser) {
    const canSeeAll = user.role === UserRole.ADMINISTRADOR || user.role === UserRole.CONTADURIA;

    const whereSolicitudes = canSeeAll
      ? undefined
      : {
          docente: {
            usuarioId: user.id
          }
        };

    const [solicitudesTotales, manualPendings, eventosSinSoporte, agendaAbierta] =
      await Promise.all([
        db.solicitudSala.count({ where: whereSolicitudes }),
        db.solicitudSala.count({ where: { estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID } }),
        db.eventoZoom.count({ where: { estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR } }),
        db.eventoZoom.count({
          where: {
            requiereAsistencia: true,
            agendaAbiertaAt: { not: null },
            agendaCierraAt: { gt: new Date() }
          }
        })
      ]);

    return {
      solicitudesTotales,
      manualPendings,
      eventosSinSoporte,
      agendaAbierta
    };
  }

  async listSolicitudes(user: SessionUser) {
    const canSeeAll =
      user.role === UserRole.ADMINISTRADOR ||
      user.role === UserRole.CONTADURIA ||
      user.role === UserRole.ASISTENTE_ZOOM ||
      user.role === UserRole.SOPORTE_ZOOM;

    return db.solicitudSala.findMany({
      where: canSeeAll
        ? undefined
        : {
            docente: {
              usuarioId: user.id
            }
          },
      orderBy: { createdAt: "desc" },
      include: {
        eventos: {
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            id: true,
            inicioProgramadoAt: true,
            estadoCobertura: true,
            zoomMeetingId: true,
            zoomJoinUrl: true
          }
        },
        cuentaZoomAsignada: {
          select: {
            id: true,
            nombreCuenta: true,
            ownerEmail: true
          }
        }
      },
      take: 200
    });
  }

  async createSolicitud(user: SessionUser, input: CreateSolicitudInput) {
    const docente = await getOrCreateDocente(user);
    const start = toDate(input.fechaInicioSolicitada, "fechaInicioSolicitada");
    const end = toDate(input.fechaFinSolicitada, "fechaFinSolicitada");
    const recurrenceEnd = input.fechaFinRecurrencia
      ? toDate(input.fechaFinRecurrencia, "fechaFinRecurrencia")
      : null;
    const grabacionPreferencia = input.grabacionPreferencia ?? "NO";
    const requiereGrabacion =
      input.requiereGrabacion ?? grabacionPreferencia === "SI";

    if (end <= start) {
      throw new Error("fechaFinSolicitada debe ser mayor a fechaInicioSolicitada.");
    }

    const durationMinutes = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 60000));
    const instancePlans = buildInstancePlans(input, durationMinutes);
    const resolvedFechasInstancias =
      input.fechasInstancias ?? input.instanciasDetalle?.map((item) => item.inicioProgramadoAt);
    const assignedAccount = await getOrCreateCuentaZoomDefault();

    if (!assignedAccount) {
      return db.solicitudSala.create({
        data: {
          docenteId: docente.id,
          createdByUserId: user.id,
          titulo: input.titulo,
          responsableNombre: input.responsableNombre,
          programaNombre: input.programaNombre,
          descripcion: input.descripcion,
          finalidadAcademica: input.finalidadAcademica,
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: input.tipoInstancias,
          meetingIdEstrategia: input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone: input.timezone ?? "America/Montevideo",
          capacidadEstimada: input.capacidadEstimada,
          controlAsistencia: input.controlAsistencia ?? false,
          docentesCorreos: input.docentesCorreos,
          grabacionPreferencia,
          requiereGrabacion,
          requiereAsistencia: input.requiereAsistencia ?? false,
          motivoAsistencia: input.motivoAsistencia,
          regimenEncuentros: input.regimenEncuentros,
          fechaFinRecurrencia: recurrenceEnd,
          patronRecurrencia: input.patronRecurrencia as Prisma.InputJsonValue | undefined,
          fechasInstancias: resolvedFechasInstancias,
          cantidadInstancias: instancePlans.length,
          estadoSolicitud: EstadoSolicitudSala.SIN_CAPACIDAD_ZOOM,
          observacionesAdmin: "No se encontró cuenta Zoom activa para provisionar."
        }
      });
    }

    const requireManualResolution =
      input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM &&
      (input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO) !==
        MeetingIdEstrategia.MULTIPLE_PERMITIDO;

    const meetingPrincipalId =
      input.tipoInstancias === TipoInstancias.MULTIPLE_NO_COMPATIBLE_ZOOM
        ? null
        : generateMeetingId("zoom");

    const status = requireManualResolution
      ? EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID
      : EstadoSolicitudSala.PROVISIONADA;

    const result = await db.$transaction(async (tx) => {
      const solicitud = await tx.solicitudSala.create({
        data: {
          docenteId: docente.id,
          createdByUserId: user.id,
          cuentaZoomAsignadaId: assignedAccount.id,
          titulo: input.titulo,
          responsableNombre: input.responsableNombre,
          programaNombre: input.programaNombre,
          descripcion: input.descripcion,
          finalidadAcademica: input.finalidadAcademica,
          modalidadReunion: input.modalidadReunion,
          tipoInstancias: input.tipoInstancias,
          meetingIdEstrategia: input.meetingIdEstrategia ?? MeetingIdEstrategia.UNICO_PREFERIDO,
          meetingPrincipalId,
          motivoMultiplesIds: requireManualResolution
            ? "El sistema no pudo asignar un único meeting ID para la solicitud." : null,
          fechaInicioSolicitada: start,
          fechaFinSolicitada: end,
          timezone: input.timezone ?? "America/Montevideo",
          capacidadEstimada: input.capacidadEstimada,
          controlAsistencia: input.controlAsistencia ?? false,
          docentesCorreos: input.docentesCorreos,
          grabacionPreferencia,
          requiereGrabacion,
          requiereAsistencia: input.requiereAsistencia ?? false,
          motivoAsistencia: input.motivoAsistencia,
          regimenEncuentros: input.regimenEncuentros,
          fechaFinRecurrencia: recurrenceEnd,
          patronRecurrencia: input.patronRecurrencia as Prisma.InputJsonValue | undefined,
          fechasInstancias: resolvedFechasInstancias,
          cantidadInstancias: instancePlans.length,
          estadoSolicitud: status
        }
      });

      const tarifa = await getActiveRate(input.modalidadReunion);
      const rate = tarifa ? Number(tarifa.valorHora) : 0;
      const estimatedCost = calculateEstimatedCost(durationMinutes, rate);

      if (!requireManualResolution) {
        await tx.eventoZoom.createMany({
          data: instancePlans.map((plan) => ({
            solicitudSalaId: solicitud.id,
            cuentaZoomId: assignedAccount.id,
            tipoEvento:
              instancePlans.length > 1 ? TipoEventoZoom.RECURRENCE_INSTANCE : TipoEventoZoom.SINGLE,
            grupoRecurrenciaId: instancePlans.length > 1 ? solicitud.id : null,
            modalidadReunion: input.modalidadReunion,
            inicioProgramadoAt: plan.inicio,
            finProgramadoAt: plan.fin,
            timezone: input.timezone ?? "America/Montevideo",
            requiereAsistencia: input.requiereAsistencia ?? false,
            estadoCobertura: input.requiereAsistencia
              ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
              : EstadoCoberturaSoporte.NO_REQUIERE,
            agendaAbiertaAt: input.requiereAsistencia ? new Date() : null,
            agendaCierraAt: input.requiereAsistencia
              ? new Date(plan.inicio.getTime() - 24 * 60 * 60000)
              : null,
            estadoEvento: "PROGRAMADO",
            zoomMeetingId: meetingPrincipalId,
            zoomJoinUrl: meetingPrincipalId
              ? `https://zoom.us/j/${meetingPrincipalId}`
              : null,
            costoEstimado: estimatedCost
          }))
        });
      }

      if (requireManualResolution) {
        const admins = await tx.user.findMany({
          where: { role: UserRole.ADMINISTRADOR }
        });

        await tx.notificacion.createMany({
          data: admins.map((admin) => ({
            usuarioId: admin.id,
            tipoNotificacion: TipoNotificacion.ALERTA_OPERATIVA,
            canalDestino: admin.email,
            asunto: "Solicitud pendiente por resolución manual de ID Zoom",
            cuerpo:
              `Solicitud ${solicitud.id}: no se pudo asegurar un único ID de reunión. ` +
              "Se requiere intervención administrativa y registro manual.",
            entidadReferenciaTipo: "SolicitudSala",
            entidadReferenciaId: solicitud.id
          }))
        });
      }

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "SOLICITUD_CREADA",
          entidadTipo: "SolicitudSala",
          entidadId: solicitud.id,
          valorNuevo: {
            estadoSolicitud: status,
            meetingPrincipalId
          }
        }
      });

      return solicitud;
    });

    return result;
  }

  async listManualProvisionPendings() {
    return db.solicitudSala.findMany({
      where: { estadoSolicitud: EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID },
      include: {
        docente: {
          include: {
            usuario: {
              select: { email: true, name: true }
            }
          }
        },
        cuentaZoomAsignada: true
      },
      orderBy: { createdAt: "asc" }
    });
  }

  async resolveManualProvision(
    user: SessionUser,
    solicitudId: string,
    input: {
      cuentaZoomAsignadaId: string;
      accionTomada: string;
      motivoSistema: string;
      zoomMeetingIdManual: string;
      zoomJoinUrlManual?: string;
      observaciones?: string;
    }
  ) {
    const solicitud = await db.solicitudSala.findUnique({ where: { id: solicitudId } });
    if (!solicitud) throw new Error("Solicitud no encontrada.");
    if (solicitud.estadoSolicitud !== EstadoSolicitudSala.PENDIENTE_RESOLUCION_MANUAL_ID) {
      throw new Error("La solicitud no está pendiente de resolución manual.");
    }

    const account = await db.cuentaZoom.findUnique({ where: { id: input.cuentaZoomAsignadaId } });
    if (!account || !account.activa) {
      throw new Error("Cuenta Zoom inválida para resolución manual.");
    }

    const minutes = Math.floor(
      (solicitud.fechaFinSolicitada.getTime() - solicitud.fechaInicioSolicitada.getTime()) / 60000
    );

    return db.$transaction(async (tx) => {
      const updated = await tx.solicitudSala.update({
        where: { id: solicitudId },
        data: {
          estadoSolicitud: EstadoSolicitudSala.PROVISIONADA,
          cuentaZoomAsignadaId: account.id,
          meetingPrincipalId: input.zoomMeetingIdManual,
          observacionesAdmin: input.observaciones,
          motivoMultiplesIds: null
        }
      });

      await tx.eventoZoom.create({
        data: {
          solicitudSalaId: solicitudId,
          cuentaZoomId: account.id,
          tipoEvento: TipoEventoZoom.SINGLE,
          modalidadReunion: solicitud.modalidadReunion,
          inicioProgramadoAt: solicitud.fechaInicioSolicitada,
          finProgramadoAt: solicitud.fechaFinSolicitada,
          timezone: solicitud.timezone,
          requiereAsistencia: solicitud.requiereAsistencia,
          estadoCobertura: solicitud.requiereAsistencia
            ? EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR
            : EstadoCoberturaSoporte.NO_REQUIERE,
          agendaAbiertaAt: solicitud.requiereAsistencia ? new Date() : null,
          agendaCierraAt: solicitud.requiereAsistencia
            ? new Date(solicitud.fechaInicioSolicitada.getTime() - 24 * 60 * 60000)
            : null,
          estadoEvento: "PROGRAMADO",
          zoomMeetingId: input.zoomMeetingIdManual,
          zoomJoinUrl: input.zoomJoinUrlManual ?? `https://zoom.us/j/${input.zoomMeetingIdManual}`,
          costoEstimado: calculateEstimatedCost(minutes, 0)
        }
      });

      await tx.resolucionManualProvision.create({
        data: {
          solicitudSalaId: solicitudId,
          usuarioAdministradorId: user.id,
          cuentaZoomAsignadaId: account.id,
          motivoSistema: input.motivoSistema,
          accionTomada: input.accionTomada,
          zoomMeetingIdManual: input.zoomMeetingIdManual,
          zoomJoinUrlManual: input.zoomJoinUrlManual,
          observaciones: input.observaciones
        }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "RESOLUCION_MANUAL_PROVISION",
          entidadTipo: "SolicitudSala",
          entidadId: solicitudId,
          valorNuevo: {
            cuentaZoomAsignadaId: account.id,
            meetingPrincipalId: input.zoomMeetingIdManual
          }
        }
      });

      return updated;
    });
  }

  async listOpenAgenda(user: SessionUser) {
    const assistant = await getOrCreateAsistente(user);

    const events = await db.eventoZoom.findMany({
      where: {
        requiereAsistencia: true,
        estadoCobertura: EstadoCoberturaSoporte.REQUERIDO_SIN_ASIGNAR,
        agendaCierraAt: { gt: new Date() }
      },
      include: {
        cuentaZoom: {
          select: {
            nombreCuenta: true,
            ownerEmail: true
          }
        },
        solicitud: {
          select: {
            titulo: true,
            modalidadReunion: true,
            programaNombre: true,
            responsableNombre: true,
            patronRecurrencia: true,
            docente: {
              include: {
                usuario: {
                  select: { email: true, name: true, firstName: true, lastName: true }
                }
              }
            }
          }
        },
        asignaciones: {
          where: {
            tipoAsignacion: "PRINCIPAL",
            estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
          },
          take: 1,
          select: {
            asistente: {
              select: {
                usuario: {
                  select: { name: true, firstName: true, lastName: true, email: true }
                }
              }
            }
          }
        },
        intereses: {
          where: { asistenteZoomId: assistant.id },
          take: 1,
          select: {
            id: true,
            estadoInteres: true,
            comentario: true,
            fechaRespuestaAt: true
          }
        }
      },
      orderBy: { inicioProgramadoAt: "asc" }
    });

    return events;
  }

  async setInterest(
    user: SessionUser,
    eventoId: string,
    input: { estadoInteres: EstadoInteresAsistente; comentario?: string }
  ) {
    const assistant = await getOrCreateAsistente(user);

    const event = await db.eventoZoom.findUnique({ where: { id: eventoId } });
    if (!event) throw new Error("Evento no encontrado.");
    if (!event.agendaCierraAt || event.agendaCierraAt <= new Date()) {
      throw new Error("La agenda de interés está cerrada para este evento.");
    }

    return db.interesAsistenteEvento.upsert({
      where: {
        eventoZoomId_asistenteZoomId: {
          eventoZoomId: eventoId,
          asistenteZoomId: assistant.id
        }
      },
      update: {
        estadoInteres: input.estadoInteres,
        comentario: input.comentario,
        fechaRespuestaAt: new Date()
      },
      create: {
        eventoZoomId: eventoId,
        asistenteZoomId: assistant.id,
        estadoInteres: input.estadoInteres,
        comentario: input.comentario
      }
    });
  }

  async assignAssistant(
    admin: SessionUser,
    eventoId: string,
    input: { asistenteZoomId: string; motivoAsignacion?: string }
  ) {
    const event = await db.eventoZoom.findUnique({ where: { id: eventoId } });
    if (!event) throw new Error("Evento no encontrado.");

    const rate = await getActiveRate(event.modalidadReunion);
    if (!rate) {
      throw new Error("No hay tarifa activa para la modalidad del evento.");
    }

    const minutes = Math.max(
      0,
      Math.floor((event.finProgramadoAt.getTime() - event.inicioProgramadoAt.getTime()) / 60000)
    );
    const hourlyRate = Number(rate.valorHora);

    return db.$transaction(async (tx) => {
      await tx.asignacionAsistente.updateMany({
        where: {
          eventoZoomId: eventoId,
          tipoAsignacion: "PRINCIPAL",
          estadoAsignacion: { in: ["ASIGNADO", "ACEPTADO"] }
        },
        data: {
          estadoAsignacion: "REASIGNADO"
        }
      });

      const assignment = await tx.asignacionAsistente.create({
        data: {
          eventoZoomId: eventoId,
          asistenteZoomId: input.asistenteZoomId,
          asignadoPorUsuarioId: admin.id,
          motivoAsignacion: input.motivoAsignacion,
          modalidadSnapshot: event.modalidadReunion,
          tarifaAplicadaHora: new Prisma.Decimal(hourlyRate),
          moneda: rate.moneda,
          montoEstimado: calculateEstimatedCost(minutes, hourlyRate)
        }
      });

      await tx.eventoZoom.update({
        where: { id: eventoId },
        data: {
          estadoCobertura: EstadoCoberturaSoporte.ASIGNADO
        }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: admin.id,
          accion: "ASIGNACION_ASISTENTE_CREADA",
          entidadTipo: "EventoZoom",
          entidadId: eventoId,
          valorNuevo: {
            asignacionId: assignment.id,
            asistenteZoomId: input.asistenteZoomId
          }
        }
      });

      return assignment;
    });
  }

  async listTarifas() {
    return db.tarifaAsistenciaGlobal.findMany({
      orderBy: [{ modalidadReunion: "asc" }, { vigenteDesde: "desc" }],
      take: 100
    });
  }

  async createTarifa(user: SessionUser, input: {
    modalidadReunion: ModalidadReunion;
    valorHora: number;
    moneda: string;
    vigenteDesde?: string;
    motivoCambio?: string;
  }) {
    if (input.valorHora < 0) {
      throw new Error("valorHora debe ser mayor o igual a 0.");
    }

    const start = input.vigenteDesde ? toDate(input.vigenteDesde, "vigenteDesde") : new Date();

    return db.$transaction(async (tx) => {
      await tx.tarifaAsistenciaGlobal.updateMany({
        where: {
          modalidadReunion: input.modalidadReunion,
          estado: EstadoTarifa.ACTIVA
        },
        data: {
          estado: EstadoTarifa.INACTIVA,
          vigenteHasta: start
        }
      });

      const created = await tx.tarifaAsistenciaGlobal.create({
        data: {
          modalidadReunion: input.modalidadReunion,
          valorHora: new Prisma.Decimal(input.valorHora),
          moneda: input.moneda,
          vigenteDesde: start,
          motivoCambio: input.motivoCambio,
          creadoPorUsuarioId: user.id,
          aprobadoPorUsuarioId: user.id
        }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: user.id,
          accion: "TARIFA_MODALIDAD_ACTUALIZADA",
          entidadTipo: "TarifaAsistenciaGlobal",
          entidadId: created.id,
          valorNuevo: {
            modalidadReunion: input.modalidadReunion,
            valorHora: input.valorHora,
            moneda: input.moneda
          }
        }
      });

      return created;
    });
  }
}
