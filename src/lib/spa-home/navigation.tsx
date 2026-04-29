import type { ReactNode } from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import WorkspacesOutlinedIcon from "@mui/icons-material/WorkspacesOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import AddIcon from "@mui/icons-material/Add";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import BuildCircleOutlinedIcon from "@mui/icons-material/BuildCircleOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import VideoSettingsOutlinedIcon from "@mui/icons-material/VideoSettingsOutlined";
import UpcomingOutlinedIcon from "@mui/icons-material/UpcomingOutlined";
import HistoryToggleOffOutlinedIcon from "@mui/icons-material/HistoryToggleOffOutlined";
import CloudDownloadOutlinedIcon from "@mui/icons-material/CloudDownloadOutlined";
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import QueryStatsOutlinedIcon from "@mui/icons-material/QueryStatsOutlined";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";

export const tabs = [
  "dashboard",
  "crear_reunion",
  "solicitudes",
  "programas",
  "agenda_libre",
  "mis_reuniones_asignadas",
  "mis_asistencias",
  "historico_asistencias",
  "asistentes_asignacion",
  "asistentes_perfiles",
  "asistentes_estadisticas",
  "manual",
  "historico",
  "cuentas",
  "proximas_zoom",
  "pasadas_zoom",
  "zoom_drive_sync",
  "estadisticas",
  "tarifas",
  "usuarios",
  "perfil"
] as const;
export type Tab = (typeof tabs)[number];

export const VIEW_ROLES = ["ADMINISTRADOR", "DOCENTE", "ASISTENTE_ZOOM", "CONTADURIA"] as const;
export type ViewRole = (typeof VIEW_ROLES)[number];
const ALL_VIEW_ROLES = [...VIEW_ROLES] as ViewRole[];

export type NavigationGroup = "GENERAL" | "OPERACION" | "ASISTENTES" | "ZOOM" | "ADMIN";

export type TabConfig = {
  label: string;
  visibleInNavigation: boolean;
  roles: ViewRole[];
  group: NavigationGroup;
};

export const NAVIGATION_GROUP_ORDER: NavigationGroup[] = ["GENERAL", "OPERACION", "ASISTENTES", "ZOOM", "ADMIN"];

export const NAVIGATION_GROUP_LABEL: Record<NavigationGroup, string> = {
  GENERAL: "Inicio",
  OPERACION: "Solicitudes",
  ASISTENTES: "Asistentes",
  ZOOM: "Zoom",
  ADMIN: "Administracion"
};

export const TAB_CONFIG: Record<Tab, TabConfig> = {
  dashboard: {
    label: "Inicio",
    visibleInNavigation: true,
    roles: ALL_VIEW_ROLES,
    group: "GENERAL"
  },
  crear_reunion: {
    label: "Crear reunión",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "DOCENTE"],
    group: "OPERACION"
  },
  solicitudes: {
    label: "Solicitudes",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "DOCENTE"],
    group: "OPERACION"
  },
  programas: {
    label: "Programas",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "DOCENTE"],
    group: "ADMIN"
  },
  agenda_libre: {
    label: "Reuniones disponibles",
    visibleInNavigation: true,
    roles: ["ASISTENTE_ZOOM"],
    group: "OPERACION"
  },
  mis_reuniones_asignadas: {
    label: "Próximas reuniones",
    visibleInNavigation: true,
    roles: ["ASISTENTE_ZOOM", "DOCENTE"],
    group: "OPERACION"
  },
  mis_asistencias: {
    label: "Reuniones del Mes",
    visibleInNavigation: true,
    roles: ["ASISTENTE_ZOOM"],
    group: "OPERACION"
  },
  historico_asistencias: {
    label: "Histórico de reuniones",
    visibleInNavigation: true,
    roles: ["ASISTENTE_ZOOM", "DOCENTE"],
    group: "OPERACION"
  },
  asistentes_asignacion: {
    label: "Tablero de Asignación",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ASISTENTES"
  },
  asistentes_perfiles: {
    label: "Perfiles y Pagos",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "CONTADURIA"],
    group: "ASISTENTES"
  },
  asistentes_estadisticas: {
    label: "Estadísticas y Reportes",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "CONTADURIA"],
    group: "ASISTENTES"
  },
  manual: {
    label: "Asociacion manual",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "OPERACION"
  },
  historico: {
    label: "Registro historico",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "OPERACION"
  },
  cuentas: {
    label: "Cuentas Zoom",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ZOOM"
  },
  proximas_zoom: {
    label: "Reuniones proximas",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ZOOM"
  },
  pasadas_zoom: {
    label: "Reuniones pasadas",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ZOOM"
  },
  zoom_drive_sync: {
    label: "Descargar grabaciones",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ZOOM"
  },
  estadisticas: {
    label: "Estadisticas",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ADMIN"
  },
  tarifas: {
    label: "Tarifas",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "CONTADURIA"],
    group: "ADMIN"
  },
  usuarios: {
    label: "Usuarios",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ADMIN"
  },
  perfil: {
    label: "Perfil",
    visibleInNavigation: false,
    roles: ALL_VIEW_ROLES,
    group: "GENERAL"
  }
};

export const ROLE_PRESENTATION_TABS: Record<ViewRole, readonly Tab[]> = {
  ADMINISTRADOR: [
    "dashboard",
    "crear_reunion",
    "solicitudes",
    "programas",
    "agenda_libre",
    "mis_reuniones_asignadas",
    "mis_asistencias",
    "historico_asistencias",
    "asistentes_asignacion",
    "asistentes_perfiles",
    "asistentes_estadisticas",
    "manual",
    "historico",
    "cuentas",
    "proximas_zoom",
    "pasadas_zoom",
    "zoom_drive_sync",
    "estadisticas",
    "tarifas",
    "usuarios",
    "perfil"
  ],
  ASISTENTE_ZOOM: [
    "dashboard",
    "agenda_libre",
    "mis_reuniones_asignadas",
    "mis_asistencias",
    "historico_asistencias",
    "perfil"
  ],
  DOCENTE: [
    "dashboard",
    "crear_reunion",
    "solicitudes",
    "programas",
    "mis_reuniones_asignadas",
    "historico_asistencias",
    "perfil"
  ],
  CONTADURIA: [
    "dashboard",
    "asistentes_perfiles",
    "asistentes_estadisticas",
    "tarifas",
    "perfil"
  ]
};

export const ROLE_DEFAULT_TAB: Record<ViewRole, Tab> = {
  ADMINISTRADOR: "dashboard",
  ASISTENTE_ZOOM: "agenda_libre",
  DOCENTE: "solicitudes",
  CONTADURIA: "dashboard"
};

export const VIEW_ROLE_COOKIE = "zoom_view_as";

export function normalizeAssistantRole(role: string): string {
  if (role === "ASISTENTE_ZOOM" || role === "SOPORTE_ZOOM") {
    return "ASISTENTE_ZOOM";
  }
  return role;
}

export function isViewRole(role: string): role is ViewRole {
  return VIEW_ROLES.includes(role as ViewRole);
}

export function canAccessTabForRole(tab: Tab, role: string): boolean {
  if (!isViewRole(role)) return tab === "dashboard";
  return ROLE_PRESENTATION_TABS[role].includes(tab) && TAB_CONFIG[tab].roles.includes(role);
}

export function getDefaultTabForRole(role: string): Tab {
  if (!isViewRole(role)) return "dashboard";
  return ROLE_DEFAULT_TAB[role];
}

export function resolveEffectiveRoleForUser(
  userRole: string | null | undefined,
  requestedViewAs: string | null | undefined
): ViewRole | "" {
  const normalizedUserRole = normalizeAssistantRole((userRole ?? "").toUpperCase());
  if (!isViewRole(normalizedUserRole)) return "";
  if (normalizedUserRole !== "ADMINISTRADOR") return normalizedUserRole;

  const normalizedRequestedRole = normalizeAssistantRole((requestedViewAs ?? "ADMINISTRADOR").toUpperCase());
  if (isViewRole(normalizedRequestedRole)) return normalizedRequestedRole;
  return "ADMINISTRADOR";
}

export function getNavigationGroupIcon(
  group: NavigationGroup,
  fontSize: "small" | "medium" | "large" = "small"
): ReactNode {
  switch (group) {
    case "GENERAL":
      return <HomeOutlinedIcon fontSize={fontSize} />;
    case "OPERACION":
      return <WorkspacesOutlinedIcon fontSize={fontSize} />;
    case "ASISTENTES":
      return <SupportAgentIcon fontSize={fontSize} />;
    case "ZOOM":
      return <VideocamOutlinedIcon fontSize={fontSize} />;
    case "ADMIN":
      return <AdminPanelSettingsOutlinedIcon fontSize={fontSize} />;
    default:
      return <HomeOutlinedIcon fontSize={fontSize} />;
  }
}

export function getTabIcon(tab: Tab): ReactNode {
  switch (tab) {
    case "dashboard":
      return <DashboardOutlinedIcon fontSize="small" />;
    case "crear_reunion":
      return <AddIcon fontSize="small" />;
    case "solicitudes":
      return <DescriptionOutlinedIcon fontSize="small" />;
    case "programas":
      return <AutoStoriesOutlinedIcon fontSize="small" />;
    case "agenda_libre":
      return <EventAvailableOutlinedIcon fontSize="small" />;
    case "mis_reuniones_asignadas":
      return <UpcomingOutlinedIcon fontSize="small" />;
    case "mis_asistencias":
      return <HistoryOutlinedIcon fontSize="small" />;
    case "historico_asistencias":
      return <HistoryToggleOffOutlinedIcon fontSize="small" />;
    case "asistentes_asignacion":
      return <AssignmentIndOutlinedIcon fontSize="small" />;
    case "asistentes_perfiles":
      return <GroupOutlinedIcon fontSize="small" />;
    case "asistentes_estadisticas":
      return <QueryStatsOutlinedIcon fontSize="small" />;
    case "manual":
      return <BuildCircleOutlinedIcon fontSize="small" />;
    case "historico":
      return <HistoryOutlinedIcon fontSize="small" />;
    case "cuentas":
      return <VideoSettingsOutlinedIcon fontSize="small" />;
    case "proximas_zoom":
      return <UpcomingOutlinedIcon fontSize="small" />;
    case "pasadas_zoom":
      return <HistoryToggleOffOutlinedIcon fontSize="small" />;
    case "zoom_drive_sync":
      return <CloudDownloadOutlinedIcon fontSize="small" />;
    case "estadisticas":
      return <QueryStatsOutlinedIcon fontSize="small" />;
    case "tarifas":
      return <PaidOutlinedIcon fontSize="small" />;
    case "usuarios":
      return <GroupOutlinedIcon fontSize="small" />;
    case "perfil":
      return <GroupOutlinedIcon fontSize="small" />;
    default:
      return <DashboardOutlinedIcon fontSize="small" />;
  }
}
