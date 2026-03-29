import type { ReactNode } from "react";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import WorkspacesOutlinedIcon from "@mui/icons-material/WorkspacesOutlined";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
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
import PaidOutlinedIcon from "@mui/icons-material/PaidOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";

export const tabs = [
  "dashboard",
  "solicitudes",
  "programas",
  "agenda_libre",
  "asignacion",
  "manual",
  "historico",
  "cuentas",
  "proximas_zoom",
  "pasadas_zoom",
  "tarifas",
  "usuarios",
  "perfil"
] as const;
export type Tab = (typeof tabs)[number];

export const VIEW_ROLES = ["ADMINISTRADOR", "DOCENTE", "SOPORTE_ZOOM", "CONTADURIA"] as const;
export type ViewRole = (typeof VIEW_ROLES)[number];
const ALL_VIEW_ROLES = [...VIEW_ROLES] as ViewRole[];

export type NavigationGroup = "GENERAL" | "OPERACION" | "ZOOM" | "ADMIN";

export type TabConfig = {
  label: string;
  visibleInNavigation: boolean;
  roles: ViewRole[];
  group: NavigationGroup;
};

export const NAVIGATION_GROUP_ORDER: NavigationGroup[] = ["GENERAL", "OPERACION", "ZOOM", "ADMIN"];

export const NAVIGATION_GROUP_LABEL: Record<NavigationGroup, string> = {
  GENERAL: "Inicio",
  OPERACION: "Operacion",
  ZOOM: "Zoom",
  ADMIN: "Administracion"
};

export const TAB_CONFIG: Record<Tab, TabConfig> = {
  dashboard: {
    label: "Dashboard",
    visibleInNavigation: true,
    roles: ALL_VIEW_ROLES,
    group: "GENERAL"
  },
  solicitudes: {
    label: "Solicitudes",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "DOCENTE", "CONTADURIA"],
    group: "OPERACION"
  },
  programas: {
    label: "Programas",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR", "DOCENTE", "CONTADURIA"],
    group: "OPERACION"
  },
  agenda_libre: {
    label: "Agenda libre",
    visibleInNavigation: true,
    roles: ["SOPORTE_ZOOM"],
    group: "OPERACION"
  },
  asignacion: {
    label: "Asignacion de personal",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "OPERACION"
  },
  manual: {
    label: "Asociacion manual",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ZOOM"
  },
  historico: {
    label: "Registro historico",
    visibleInNavigation: true,
    roles: ["ADMINISTRADOR"],
    group: "ZOOM"
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

export const VIEW_ROLE_COOKIE = "zoom_view_as";

export function normalizeSupportRole(role: string): string {
  if (role === "ASISTENTE_ZOOM" || role === "SOPORTE_ZOOM") {
    return "SOPORTE_ZOOM";
  }
  return role;
}

export function isViewRole(role: string): role is ViewRole {
  return VIEW_ROLES.includes(role as ViewRole);
}

export function canAccessTabForRole(tab: Tab, role: string): boolean {
  if (!isViewRole(role)) return tab === "dashboard";
  return TAB_CONFIG[tab].roles.includes(role);
}

export function getNavigationGroupIcon(group: NavigationGroup): ReactNode {
  switch (group) {
    case "GENERAL":
      return <HomeOutlinedIcon fontSize="small" />;
    case "OPERACION":
      return <WorkspacesOutlinedIcon fontSize="small" />;
    case "ZOOM":
      return <VideocamOutlinedIcon fontSize="small" />;
    case "ADMIN":
      return <AdminPanelSettingsOutlinedIcon fontSize="small" />;
    default:
      return <HomeOutlinedIcon fontSize="small" />;
  }
}

export function getTabIcon(tab: Tab): ReactNode {
  switch (tab) {
    case "dashboard":
      return <DashboardOutlinedIcon fontSize="small" />;
    case "solicitudes":
      return <DescriptionOutlinedIcon fontSize="small" />;
    case "programas":
      return <AutoStoriesOutlinedIcon fontSize="small" />;
    case "agenda_libre":
      return <EventAvailableOutlinedIcon fontSize="small" />;
    case "asignacion":
      return <AssignmentIndOutlinedIcon fontSize="small" />;
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
