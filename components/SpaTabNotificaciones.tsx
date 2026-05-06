"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Pagination,
  CircularProgress,
  Tooltip
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import MarkEmailUnreadOutlinedIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LaunchIcon from "@mui/icons-material/Launch";

import { usePushNotifications } from "@/src/hooks/usePushNotifications";
import { SolicitudDetailDialog } from "@/components/spa-tabs/SolicitudDetailDialog";

type NotificationScope = "mine" | "all";
type NotificationReadFilter = "TODAS" | "LEIDAS" | "NO_LEIDAS";
type NotificationOrder = "asc" | "desc";
type NotificationActivityFilter = "TODAS" | "LOGIN";

interface NotificacionUsuario {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface Notificacion {
  id: string;
  usuarioId: string;
  tipoNotificacion: "EMAIL" | "IN_APP" | "ALERTA_OPERATIVA";
  canalDestino: string;
  asunto: string;
  cuerpo: string;
  estadoEnvio: "PENDIENTE" | "ENVIADA" | "FALLIDA";
  intentoCount: number;
  ultimoIntentoAt: string | null;
  entidadReferenciaTipo: string | null;
  entidadReferenciaId: string | null;
  leidaAt: string | null;
  createdAt: string;
  updatedAt: string;
  usuario: NotificacionUsuario;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface NotificacionesResponse {
  scope: NotificationScope;
  orden: NotificationOrder;
  actividad?: NotificationActivityFilter;
  notificaciones: Notificacion[];
  unreadCount: number;
  pagination: PaginationInfo;
}

type SpaTabNotificacionesProps = {
  isAdmin: boolean;
};

function getTipoIcon(tipo: Notificacion["tipoNotificacion"]) {
  switch (tipo) {
    case "EMAIL":
      return <EmailOutlinedIcon fontSize="small" color="primary" />;
    case "IN_APP":
      return <NotificationsActiveOutlinedIcon fontSize="small" color="info" />;
    case "ALERTA_OPERATIVA":
      return <WarningAmberOutlinedIcon fontSize="small" color="warning" />;
    default:
      return <NotificationsActiveOutlinedIcon fontSize="small" />;
  }
}

function getTipoLabel(tipo: Notificacion["tipoNotificacion"]): string {
  switch (tipo) {
    case "EMAIL":
      return "Email";
    case "ALERTA_OPERATIVA":
      return "Alerta";
    case "IN_APP":
    default:
      return "In-App";
  }
}

type NotificationBodyField = {
  label: string;
  value: string;
};

function isLoginNotification(notif: Notificacion): boolean {
  if (notif.entidadReferenciaTipo === "LOGIN") return true;
  return /inicio de sesion/i.test(notif.asunto);
}

function isAssistantInterestNotification(notif: Notificacion): boolean {
  return /interes asistente actualizado/i.test(notif.asunto);
}

function splitNotificationBody(body: string): {
  intro: string;
  fields: NotificationBodyField[];
} {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { intro: "", fields: [] };
  }

  const [intro, ...details] = lines;
  const fields = details.reduce<NotificationBodyField[]>((acc, line) => {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) return acc;
    const label = line.slice(0, separatorIndex).replace(/^-+\s*/, "").trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!label || !value) return acc;
    acc.push({ label, value });
    return acc;
  }, []);

  return { intro, fields };
}

function getFieldValue(fields: NotificationBodyField[], label: string): string | null {
  const normalizedLabel = label.trim().toLowerCase();
  const match = fields.find((field) => field.label.trim().toLowerCase() === normalizedLabel);
  return match?.value ?? null;
}

function getFieldValueAny(fields: NotificationBodyField[], labels: string[]): string | null {
  for (const label of labels) {
    const value = getFieldValue(fields, label);
    if (value) return value;
  }
  return null;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function getUserDisplay(usuario: NotificacionUsuario): string {
  if (usuario.name) return usuario.name;
  if (usuario.firstName || usuario.lastName) {
    return `${usuario.firstName ?? ""} ${usuario.lastName ?? ""}`.trim();
  }
  return usuario.email;
}

function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateString));
}

function getDateGroupLabel(dateString: string): string {
  const d = new Date(dateString);
  const now = new Date();
  
  const diffTime = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  const isToday = d.getDate() === now.getDate() && 
                  d.getMonth() === now.getMonth() && 
                  d.getFullYear() === now.getFullYear();
                  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.getDate() === yesterday.getDate() && 
                      d.getMonth() === yesterday.getMonth() && 
                      d.getFullYear() === yesterday.getFullYear();

  if (isToday) return "Hoy";
  if (isYesterday) return "Ayer";
  if (diffDays < 7) return "Esta semana";
  return "Anteriores";
}

export function SpaTabNotificaciones({ isAdmin }: SpaTabNotificacionesProps) {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 30,
    total: 0,
    pages: 1
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [scope, setScope] = useState<NotificationScope>("mine");
  const [lecturaFiltro, setLecturaFiltro] = useState<NotificationReadFilter>("TODAS");
  const [ordenFiltro, setOrdenFiltro] = useState<NotificationOrder>("desc");
  const [tipoFiltro, setTipoFiltro] = useState<"" | "EMAIL" | "IN_APP" | "ALERTA_OPERATIVA">("");
  const [actividadFiltro, setActividadFiltro] = useState<NotificationActivityFilter>("TODAS");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | "PENDIENTE" | "ENVIADA" | "FALLIDA">("");
  const [error, setError] = useState("");
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [pushTestMessage, setPushTestMessage] = useState("");
  const [pushTestError, setPushTestError] = useState("");
  const { 
    permission: pushPermission, 
    isSubscribed, 
    isLoading: isPushLoading, 
    subscribe: subscribePush, 
    unsubscribe: unsubscribePush 
  } = usePushNotifications();

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSolicitudId, setSelectedSolicitudId] = useState<string | null>(null);

  const openDetail = (id: string) => {
    setSelectedSolicitudId(id);
    setDetailOpen(true);
  };

  async function fetchNotificaciones(page: number = 1) {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "30");
      params.set("lectura", lecturaFiltro);
      params.set("orden", ordenFiltro);
      if (tipoFiltro) params.set("tipo", tipoFiltro);
      if (actividadFiltro !== "TODAS") params.set("actividad", actividadFiltro);
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (isAdmin) params.set("scope", scope);

      const response = await fetch(`/api/v1/notificaciones?${params.toString()}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as NotificacionesResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Error al cargar notificaciones");
      }

      setNotificaciones(data.notificaciones);
      setPagination(data.pagination);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar notificaciones.");
    } finally {
      setIsLoading(false);
    }
  }

  async function markAsRead(ids: string[], leida: boolean) {
    if (ids.length === 0) return;
    setIsMutating(true);
    setError("");
    try {
      const response = await fetch("/api/v1/notificaciones", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ids,
          leida,
          scope
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la notificacion.");
      }
      await fetchNotificaciones(pagination.page);
    } catch (patchError) {
      setError(
        patchError instanceof Error ? patchError.message : "No se pudo actualizar la notificacion."
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteNotificaciones(ids: string[]) {
    if (ids.length === 0) return;
    setIsMutating(true);
    setError("");
    try {
      const response = await fetch("/api/v1/notificaciones", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ids,
          scope
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo borrar la notificacion.");
      }
      const targetPage = notificaciones.length === 1 && pagination.page > 1 ? pagination.page - 1 : pagination.page;
      await fetchNotificaciones(targetPage);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "No se pudo borrar la notificacion."
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function testBrowserNotification() {
    setPushTestError("");
    setPushTestMessage("");
    setIsTestingPush(true);

    try {
      if (pushPermission === "unsupported") {
        setPushTestError("Este navegador no soporta notificaciones push.");
        return;
      }

      if (!isSubscribed) {
        const subscribed = await subscribePush();
        if (!subscribed) {
          setPushTestError("No se pudo activar la suscripcion push en este navegador.");
          return;
        }
      }

      const response = await fetch("/api/v1/notificaciones/push/test", {
        method: "POST"
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setPushTestError(data.error ?? "No se pudo enviar la notificacion de prueba.");
        return;
      }

      setPushTestMessage(
        data.message ??
          "Notificacion de prueba enviada. Si no aparece de inmediato, revisa permisos del navegador."
      );
    } catch {
      setPushTestError("Ocurrio un error al probar la notificacion del navegador.");
    } finally {
      setIsTestingPush(false);
    }
  }

  useEffect(() => {
    void fetchNotificaciones(1);
  }, [scope, lecturaFiltro, ordenFiltro, tipoFiltro, actividadFiltro, estadoFiltro]);

  const currentPageUnreadIds = useMemo(
    () => notificaciones.filter((item) => !item.leidaAt).map((item) => item.id),
    [notificaciones]
  );

  const groupedNotificaciones = useMemo(() => {
    const groups: Record<string, Notificacion[]> = {};
    notificaciones.forEach(notif => {
      const label = getDateGroupLabel(notif.createdAt);
      if (!groups[label]) groups[label] = [];
      groups[label].push(notif);
    });
    return groups;
  }, [notificaciones]);

  const groupOrder = ["Hoy", "Ayer", "Esta semana", "Anteriores"];

  return (
    <Card variant="outlined" sx={{ borderRadius: 3.5, border: "none", backgroundColor: "transparent" }}>
      <CardContent sx={{ p: { xs: 0, sm: 1 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3, px: { xs: 1.5, sm: 2 } }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>
              Notificaciones
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Historial de alertas y mensajes del sistema.
            </Typography>
          </Box>
          <IconButton
            size="medium"
            onClick={() => {
              void fetchNotificaciones(pagination.page);
            }}
            disabled={isLoading || isMutating}
            sx={{ 
              backgroundColor: "background.paper", 
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              "&:hover": { backgroundColor: "grey.100" }
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3, px: { xs: 1.5, sm: 2 } }}>
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 1.5, 
              borderRadius: 3, 
              flex: 1, 
              display: "flex", 
              alignItems: "center", 
              gap: 2,
              backgroundColor: "background.paper",
              border: "1px solid",
              borderColor: "divider"
            }}
          >
            <Box 
              sx={{ 
                width: 44, 
                height: 44, 
                borderRadius: "12px", 
                backgroundColor: "rgba(31, 75, 143, 0.08)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center" 
              }}
            >
              <NotificationsActiveOutlinedIcon sx={{ color: "primary.main" }} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block" }}>
                Sin leer
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {unreadCount}
              </Typography>
            </Box>
          </Paper>

          <Paper 
            variant="outlined" 
            sx={{ 
              p: 1.5, 
              borderRadius: 3, 
              flex: 1, 
              display: "flex", 
              alignItems: "center", 
              gap: 2,
              backgroundColor: "background.paper",
              border: "1px solid",
              borderColor: "divider"
            }}
          >
            <Box 
              sx={{ 
                width: 44, 
                height: 44, 
                borderRadius: "12px", 
                backgroundColor: "rgba(0, 0, 0, 0.04)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center" 
              }}
            >
              <AccessTimeIcon sx={{ color: "text.secondary" }} />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block" }}>
                Total filtrado
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                {pagination.total}
              </Typography>
            </Box>
          </Paper>

          <Paper 
            variant="outlined" 
            sx={{ 
              p: 1.5, 
              borderRadius: 3, 
              flex: 1.2, 
              display: "flex", 
              flexDirection: "column",
              justifyContent: "center",
              backgroundColor: isSubscribed ? "success.main" : "primary.main",
              color: "white",
              border: "none",
              cursor: (pushPermission === "unsupported" || isPushLoading) ? "default" : "pointer",
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: isSubscribed ? "success.dark" : "primary.dark",
                opacity: (pushPermission === "unsupported" || isPushLoading) ? 1 : 0.9
              }
            }}
            onClick={() => {
              if (isPushLoading || pushPermission === "unsupported") return;
              if (isSubscribed) {
                void unsubscribePush();
              } else {
                void subscribePush();
              }
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.9 }}>
              Notificaciones Push
            </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {isPushLoading 
                  ? "Cargando..." 
                  : pushPermission === "unsupported"
                    ? "No soportado"
                  : isSubscribed 
                    ? "Activadas (PWA/Push)" 
                    : "Activar en este dispositivo"}
              </Typography>
              <Button
                size="small"
                variant="outlined"
                onClick={(event) => {
                  event.stopPropagation();
                  void testBrowserNotification();
                }}
                disabled={isPushLoading || isTestingPush || pushPermission === "unsupported"}
                sx={{
                  mt: 1,
                  alignSelf: "flex-start",
                  textTransform: "none",
                  fontWeight: 700,
                  borderColor: "rgba(255,255,255,0.7)",
                  color: "white",
                  "&:hover": {
                    borderColor: "white",
                    backgroundColor: "rgba(255,255,255,0.12)"
                  }
                }}
              >
                {isTestingPush ? "Probando..." : "Probar notificacion"}
              </Button>
              {pushTestMessage ? (
                <Typography variant="caption" sx={{ mt: 0.8, display: "block", opacity: 0.9 }}>
                  {pushTestMessage}
                </Typography>
              ) : null}
              {pushTestError ? (
                <Typography variant="caption" sx={{ mt: 0.8, display: "block", color: "#ffebee" }}>
                  {pushTestError}
                </Typography>
              ) : null}
            </Paper>
        </Stack>

        <Paper 
          variant="outlined" 
          sx={{ 
            mx: { xs: 1.5, sm: 2 }, 
            mb: 3, 
            p: 1, 
            borderRadius: 3, 
            backgroundColor: "rgba(0,0,0,0.02)",
            border: "1px solid rgba(0,0,0,0.05)"
          }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
            <Box sx={{ flex: 1, minWidth: 140 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, ml: 1, fontWeight: 700 }}>
                LECTURA
              </Typography>
              <ToggleButtonGroup
                size="small"
                fullWidth
                value={lecturaFiltro}
                exclusive
                onChange={(_event, value: NotificationReadFilter | null) => {
                  if (!value) return;
                  setLecturaFiltro(value);
                }}
                sx={{ 
                  backgroundColor: "background.paper",
                  "& .MuiToggleButton-root": {
                    border: "none",
                    borderRadius: "8px !important",
                    mx: 0.2,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "none",
                    "&.Mui-selected": {
                      backgroundColor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { backgroundColor: "primary.dark" }
                    }
                  }
                }}
              >
                <ToggleButton value="TODAS">Todas</ToggleButton>
                <ToggleButton value="NO_LEIDAS">Sin leer</ToggleButton>
                <ToggleButton value="LEIDAS">Leídas</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box sx={{ flex: 1, minWidth: 160 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, ml: 1, fontWeight: 700 }}>
                TIPO
              </Typography>
              <ToggleButtonGroup
                size="small"
                fullWidth
                value={tipoFiltro}
                exclusive
                onChange={(_event, value: "" | "EMAIL" | "IN_APP" | "ALERTA_OPERATIVA" | null) => {
                  if (value === null) return;
                  setTipoFiltro(value);
                }}
                sx={{ 
                  backgroundColor: "background.paper",
                  "& .MuiToggleButton-root": {
                    border: "none",
                    borderRadius: "8px !important",
                    mx: 0.2,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "none",
                    "&.Mui-selected": {
                      backgroundColor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { backgroundColor: "primary.dark" }
                    }
                  }
                }}
              >
                <ToggleButton value="">Todos</ToggleButton>
                <ToggleButton value="IN_APP">App</ToggleButton>
                <ToggleButton value="ALERTA_OPERATIVA">Alertas</ToggleButton>
                <ToggleButton value="EMAIL">Email</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box sx={{ flex: 1, minWidth: 190 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, ml: 1, fontWeight: 700 }}>
                ACTIVIDAD
              </Typography>
              <ToggleButtonGroup
                size="small"
                fullWidth
                value={actividadFiltro}
                exclusive
                onChange={(_event, value: NotificationActivityFilter | null) => {
                  if (!value) return;
                  setActividadFiltro(value);
                }}
                sx={{
                  backgroundColor: "background.paper",
                  "& .MuiToggleButton-root": {
                    border: "none",
                    borderRadius: "8px !important",
                    mx: 0.2,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "none",
                    "&.Mui-selected": {
                      backgroundColor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { backgroundColor: "primary.dark" }
                    }
                  }
                }}
              >
                <ToggleButton value="TODAS">Todas</ToggleButton>
                <ToggleButton value="LOGIN">Inicio sesión</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {isAdmin && (
              <Box sx={{ flex: 1, minWidth: 140 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, ml: 1, fontWeight: 700 }}>
                  ALCANCE
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  fullWidth
                  value={scope}
                  exclusive
                  onChange={(_event, value: NotificationScope | null) => {
                    if (!value) return;
                    setScope(value);
                  }}
                  sx={{ 
                    backgroundColor: "background.paper",
                    "& .MuiToggleButton-root": {
                      border: "none",
                      borderRadius: "8px !important",
                      mx: 0.2,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "none",
                      "&.Mui-selected": {
                        backgroundColor: "primary.main",
                        color: "primary.contrastText",
                        "&:hover": { backgroundColor: "primary.dark" }
                      }
                    }
                  }}
                >
                  <ToggleButton value="mine">Mías</ToggleButton>
                  <ToggleButton value="all">Todas</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            <Box sx={{ display: "flex", alignItems: "flex-end", pb: 0.2 }}>
              <Button
                size="small"
                variant="text"
                startIcon={<MarkEmailReadOutlinedIcon fontSize="small" />}
                onClick={() => {
                  void markAsRead(currentPageUnreadIds, true);
                }}
                disabled={isLoading || isMutating || currentPageUnreadIds.length === 0}
                sx={{ 
                  textTransform: "none", 
                  fontWeight: 700, 
                  height: 36, 
                  borderRadius: 2,
                  px: 2
                }}
              >
                Leer todas
              </Button>
            </Box>
          </Stack>
        </Paper>

        {error ? (
          <Alert severity="error" sx={{ mx: 2, mb: 2, borderRadius: 2 }}>
            {error}
          </Alert>
        ) : null}

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress thickness={5} size={40} sx={{ color: "primary.main", opacity: 0.5 }} />
          </Box>
        ) : notificaciones.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 10, px: 2 }}>
            <Box 
              sx={{ 
                width: 80, 
                height: 80, 
                borderRadius: "50%", 
                backgroundColor: "grey.50", 
                display: "inline-flex", 
                alignItems: "center", 
                justifyContent: "center",
                mb: 2
              }}
            >
              <NotificationsActiveOutlinedIcon sx={{ fontSize: 40, color: "grey.300" }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: "text.secondary" }}>
              Bandeja vacía
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No se encontraron notificaciones con los filtros actuales.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ px: { xs: 0, sm: 2 }, pb: 4 }}>
            {groupOrder.map((group) => {
              const groupNotifs = groupedNotificaciones[group];
              if (!groupNotifs || groupNotifs.length === 0) return null;

              return (
                <Box key={group} sx={{ mb: 4 }}>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      display: "block", 
                      mb: 1.5, 
                      ml: 1, 
                      fontWeight: 800, 
                      color: "text.secondary", 
                      letterSpacing: "0.05em",
                      textTransform: "uppercase"
                    }}
                  >
                    {group}
                  </Typography>
                  <Stack spacing={1}>
                    {groupNotifs.map((notif) => {
                      const loginNotification = isLoginNotification(notif);
                      const assistantInterestNotification = isAssistantInterestNotification(notif);
                      const parsedBody = splitNotificationBody(notif.cuerpo);
                      const usuarioValue = getFieldValue(parsedBody.fields, "Usuario");
                      const dispositivoValue = getFieldValue(parsedBody.fields, "Dispositivo");
                      const proveedorValue = getFieldValue(parsedBody.fields, "Proveedor");
                      const ipValue = getFieldValue(parsedBody.fields, "IP");
                      const userAgentValue = getFieldValue(parsedBody.fields, "User-Agent");
                      const assistantName =
                        getFieldValueAny(parsedBody.fields, ["Asistente", "Asistente nombre", "Actor"]) ??
                        parsedBody.intro;
                      const interestValue = getFieldValueAny(parsedBody.fields, [
                        "Interes marcado",
                        "Estado interes",
                        "EstadoInteres",
                        "Interes"
                      ]);
                      const meetingTitle = getFieldValueAny(parsedBody.fields, [
                        "Reunion",
                        "Titulo reunion",
                        "Titulo",
                        "Entidad"
                      ]);
                      const meetingDate = getFieldValueAny(parsedBody.fields, [
                        "Dia y hora",
                        "Fecha reunion",
                        "Fecha y hora",
                        "Fecha"
                      ]);

                      return (
                        <Paper
                          key={notif.id}
                          variant="outlined"
                          sx={{
                            p: 2,
                            borderRadius: 3,
                            position: "relative",
                            backgroundColor: "background.paper",
                            borderColor: notif.leidaAt ? "divider" : "rgba(31, 75, 143, 0.2)",
                            borderWidth: notif.leidaAt ? "1px" : "1.5px",
                            boxShadow: notif.leidaAt ? "none" : "0 4px 12px rgba(31, 75, 143, 0.05)",
                            transition: "all 0.2s ease",
                            "&:hover": {
                              borderColor: "primary.main",
                              transform: "translateY(-2px)",
                              boxShadow: "0 6px 20px rgba(0,0,0,0.06)",
                              "& .action-buttons": { opacity: 1 }
                            }
                          }}
                        >
                          {!notif.leidaAt && (
                            <Box
                              sx={{
                                position: "absolute",
                                top: 22,
                                left: 10,
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                backgroundColor: "#3b82f6",
                                boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.1)"
                              }}
                            />
                          )}

                          <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: "10px",
                                backgroundColor: notif.leidaAt ? "grey.50" : "rgba(31, 75, 143, 0.05)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                mt: 0.5
                              }}
                            >
                              {getTipoIcon(notif.tipoNotificacion)}
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                <Typography
                                  variant="body1"
                                  sx={{
                                    fontWeight: notif.leidaAt ? 600 : 800,
                                    color: notif.leidaAt ? "text.primary" : "primary.main",
                                    lineHeight: 1.3
                                  }}
                                >
                                  {notif.asunto}
                                </Typography>
                                <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600, whiteSpace: "nowrap", ml: 2 }}>
                                  {formatTime(notif.createdAt)}
                                </Typography>
                              </Stack>

                              {loginNotification ? (
                                <Box sx={{ mb: 1 }}>
                                  {parsedBody.intro ? (
                                    <Typography
                                      variant="body2"
                                      color="text.secondary"
                                      sx={{ mb: 1, fontSize: "0.875rem", opacity: notif.leidaAt ? 0.75 : 0.9 }}
                                    >
                                      {parsedBody.intro}
                                    </Typography>
                                  ) : null}
                                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: userAgentValue ? 0.5 : 0 }}>
                                    {usuarioValue ? <Chip size="small" label={`Usuario: ${usuarioValue}`} variant="outlined" /> : null}
                                    {dispositivoValue ? <Chip size="small" label={`Dispositivo: ${dispositivoValue}`} variant="outlined" /> : null}
                                    {proveedorValue ? <Chip size="small" label={`Proveedor: ${proveedorValue}`} variant="outlined" /> : null}
                                    {ipValue ? <Chip size="small" label={`IP: ${ipValue}`} variant="outlined" /> : null}
                                  </Stack>
                                  {userAgentValue ? (
                                    <Tooltip title={userAgentValue}>
                                      <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{ display: "block", fontFamily: "monospace", opacity: 0.75 }}
                                      >
                                        User-Agent: {truncateText(userAgentValue, 110)}
                                      </Typography>
                                    </Tooltip>
                                  ) : null}
                                </Box>
                              ) : assistantInterestNotification ? (
                                <Box sx={{ mb: 1 }}>
                                  <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ mb: 0.6, fontSize: "0.9rem", fontWeight: 700 }}
                                  >
                                    {assistantName || "Asistente"}{interestValue ? ` marco "${interestValue}".` : " actualizo su interes."}
                                  </Typography>
                                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                    {meetingTitle ? <Chip size="small" label={`Reunion: ${meetingTitle}`} variant="outlined" /> : null}
                                    {meetingDate ? <Chip size="small" label={`Dia: ${meetingDate}`} variant="outlined" /> : null}
                                  </Stack>
                                </Box>
                              ) : (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    whiteSpace: "pre-wrap",
                                    mb: 1,
                                    fontSize: "0.875rem",
                                    lineHeight: 1.5,
                                    opacity: notif.leidaAt ? 0.7 : 0.9
                                  }}
                                >
                                  {notif.cuerpo}
                                </Typography>
                              )}

                              <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                {scope === "all" && (
                                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.primary" }}>
                                    Para: {getUserDisplay(notif.usuario)}
                                  </Typography>
                                )}
                                <Chip
                                  size="small"
                                  label={getTipoLabel(notif.tipoNotificacion)}
                                  variant="outlined"
                                  sx={{
                                    height: 20,
                                    fontSize: "0.65rem",
                                    fontWeight: 800,
                                    textTransform: "uppercase",
                                    borderColor: "divider",
                                    color: "text.secondary"
                                  }}
                                />
                                {loginNotification ? (
                                  <Chip
                                    size="small"
                                    label="Inicio sesión"
                                    color="info"
                                    variant="outlined"
                                    sx={{
                                      height: 20,
                                      fontSize: "0.65rem",
                                      fontWeight: 800
                                    }}
                                  />
                                ) : null}
                                {assistantInterestNotification ? (
                                  <Chip
                                    size="small"
                                    label="Interes asistente"
                                    color="warning"
                                    variant="outlined"
                                    sx={{
                                      height: 20,
                                      fontSize: "0.65rem",
                                      fontWeight: 800
                                    }}
                                  />
                                ) : null}
                                {notif.entidadReferenciaTipo === "SolicitudSala" && notif.entidadReferenciaId && (
                                  <Button
                                    size="small"
                                    variant="text"
                                    startIcon={<LaunchIcon fontSize="inherit" />}
                                    onClick={() => openDetail(notif.entidadReferenciaId!)}
                                    sx={{
                                      height: 20,
                                      fontSize: "0.65rem",
                                      fontWeight: 800,
                                      textTransform: "none",
                                      color: "primary.main",
                                      p: 0,
                                      minWidth: 0,
                                      "&:hover": { backgroundColor: "transparent", textDecoration: "underline" }
                                    }}
                                  >
                                    Ver Solicitud
                                  </Button>
                                )}
                              </Stack>
                            </Box>

                            <Stack
                              className="action-buttons"
                              direction="row"
                              spacing={0.5}
                              sx={{
                                opacity: { xs: 1, md: 0 },
                                transition: "opacity 0.2s ease",
                                alignItems: "center"
                              }}
                            >
                              <Tooltip title={notif.leidaAt ? "Marcar como sin leer" : "Marcar como leída"}>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    void markAsRead([notif.id], !notif.leidaAt);
                                  }}
                                  disabled={isMutating}
                                  sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
                                >
                                  {notif.leidaAt ? (
                                    <MarkEmailUnreadOutlinedIcon fontSize="small" />
                                  ) : (
                                    <MarkEmailReadOutlinedIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </Tooltip>

                              <Tooltip title="Borrar">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    void deleteNotificaciones([notif.id]);
                                  }}
                                  disabled={isMutating}
                                  sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <ChevronRightIcon sx={{ color: "grey.300", ml: 0.5, display: { xs: "none", sm: "block" } }} />
                            </Stack>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}

            {pagination.pages > 1 && (
              <Stack direction="row" justifyContent="center" sx={{ mt: 6 }}>
                <Pagination
                  count={pagination.pages}
                  page={pagination.page}
                  onChange={(_event, page) => {
                    void fetchNotificaciones(page);
                  }}
                  disabled={isLoading || isMutating}
                  size="large"
                  sx={{
                    "& .MuiPaginationItem-root": {
                      fontWeight: 700,
                      borderRadius: 2
                    }
                  }}
                />
              </Stack>
            )}
          </Box>
        )}
      </CardContent>

      <SolicitudDetailDialog
        solicitudId={selectedSolicitudId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedSolicitudId(null);
        }}
      />
    </Card>
  );
}
