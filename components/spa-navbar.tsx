"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Box,
  Button,
  Chip,
  Container,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import { FlacsoBrandLogo } from "@/components/flacso-brand-logo";
import { UserMenu } from "@/components/user-menu";
import {
  type Tab,
  type NavigationGroup,
  NAVIGATION_GROUP_LABEL,
  NAVIGATION_GROUP_ORDER,
  TAB_CONFIG,
  getNavigationGroupIcon,
  getTabIcon
} from "@/src/lib/spa-home/navigation";

export type SpaNavbarUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
};

type NavbarAction = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  emphasis?: boolean;
  onClick: () => void;
};

type SpaNavbarProps = {
  user?: SpaNavbarUser | null;
  roleLabel: string;
  title: string;
  subtitle: string;
  activeTab: string;
  isAdmin: boolean;
  canCreateDocenteShortcut: boolean;
  onCreateDocenteShortcut?: () => void;
  adminNavigationGroups?: Array<{
    group: NavigationGroup;
    tabs: Tab[];
  }>;
  roleQuickActions?: NavbarAction[];
  onSelectTab: (tab: string) => void;
  docenteSolicitudesView?: "form" | "list";
  onChangeDocenteSolicitudesView?: (view: "form" | "list") => void;
};

export function SpaNavbar({
  user,
  roleLabel,
  title,
  subtitle,
  activeTab,
  isAdmin,
  canCreateDocenteShortcut,
  onCreateDocenteShortcut,
  adminNavigationGroups = [],
  roleQuickActions = [],
  onSelectTab,
  docenteSolicitudesView,
  onChangeDocenteSolicitudesView
}: SpaNavbarProps) {
  const [openGroup, setOpenGroup] = useState<NavigationGroup | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const currentMonthLabel = useMemo(() => {
    const month = new Date().toLocaleDateString("es-UY", { month: "long" });
    return month.charAt(0).toUpperCase() + month.slice(1);
  }, []);

  const adminGroups = useMemo(
    () =>
      NAVIGATION_GROUP_ORDER.map((group) => {
        const groupTabs = adminNavigationGroups.find((item) => item.group === group)?.tabs ?? [];
        let label = NAVIGATION_GROUP_LABEL[group];
        if (group === "OPERACION" && user?.role === "ASISTENTE_ZOOM") {
          label = "Asistencias";
        }
        return {
          group,
          label,
          tabs: groupTabs
        };
      }).filter((item) => item.tabs.length > 0),
    [adminNavigationGroups, user?.role]
  );

  function openMenu(group: NavigationGroup, currentAnchor: HTMLElement) {
    setOpenGroup(group);
    setAnchorEl(currentAnchor);
  }

  function closeMenu() {
    setOpenGroup(null);
    setAnchorEl(null);
  }

  function getTabDisplayLabel(tabKey: string): string {
    const config = TAB_CONFIG[tabKey as keyof typeof TAB_CONFIG];
    if (!config) return tabKey;
    if (tabKey === "mis_asistencias") {
      return `Reuniones de ${currentMonthLabel}`;
    }
    if (tabKey === "solicitudes") {
      if (user?.role === "DOCENTE") return "Mis Solicitudes";
      if (isAdmin) return "Todas las solicitudes";
    }
    return config.label;
  }

  const activeLabel = getTabDisplayLabel(activeTab) || title;

  return (
    <Box
      component="header"
      sx={{
        mb: 2,
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: "background.paper",
        boxShadow: "0 8px 24px rgba(15, 26, 45, 0.06)",
        overflow: "hidden"
      }}
    >
      <Container maxWidth="lg" sx={{ py: { xs: 1.1, sm: 1.25 } }}>
        <Stack spacing={1}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.2}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 0 }}>
              <Link href="/" style={{ display: "inline-flex" }}>
                <FlacsoBrandLogo height={32} />
              </Link>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.1 }} noWrap>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {subtitle}
                </Typography>
              </Box>
            </Stack>

            <Stack
              direction="row"
              spacing={0.75}
              alignItems="center"
              sx={{ flexShrink: 0, width: { xs: "100%", md: "auto" }, justifyContent: { xs: "space-between", md: "flex-end" } }}
            >
              <Chip size="small" variant="outlined" label={`Rol: ${roleLabel}`} />
              {user ? (
                <UserMenu
                  firstName={user.firstName}
                  lastName={user.lastName}
                  email={user.email}
                  image={user.image}
                  role={user.role}
                />
              ) : null}
              <Button
                size="small"
                variant="outlined"
                onClick={() => setMobileExpanded((prev) => !prev)}
                startIcon={mobileExpanded ? <ExpandLessRoundedIcon fontSize="small" /> : <ExpandMoreRoundedIcon fontSize="small" />}
                sx={{ display: { xs: "inline-flex", md: "none" }, minWidth: 0 }}
              >
                Menú
              </Button>
            </Stack>
          </Stack>

          {canCreateDocenteShortcut && onCreateDocenteShortcut ? (
            <Button
              size="small"
              variant="contained"
              startIcon={getTabIcon("solicitudes")}
              onClick={onCreateDocenteShortcut}
              sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, width: { xs: "100%", sm: "auto" } }}
            >
              Crear sala Zoom
            </Button>
          ) : null}

          {isAdmin ? (
            <Box
              sx={{
                borderTop: "1px solid",
                borderColor: "divider",
                pt: 1,
                display: { xs: mobileExpanded ? "block" : "none", md: "block" }
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={0.8}
                sx={{ overflowX: { xs: "visible", sm: "auto" }, py: 0.2, px: 0.1 }}
              >
                {adminGroups.map((groupItem) => {
                  const activeTabInGroup = groupItem.tabs.find((candidateTab) => candidateTab === activeTab) ?? null;
                  const hasSingleTab = groupItem.tabs.length === 1;
                  const singleTab = hasSingleTab ? groupItem.tabs[0] : null;
                  const currentLabel = activeTabInGroup ? getTabDisplayLabel(activeTabInGroup) : "Elegir sección";

                  return (
                    <Box key={groupItem.group} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
                      <Button
                        variant={activeTabInGroup ? "contained" : "outlined"}
                        color={activeTabInGroup ? "primary" : "inherit"}
                        onClick={(event) => {
                          if (hasSingleTab && singleTab) {
                            onSelectTab(singleTab);
                            return;
                          }
                          openMenu(groupItem.group, event.currentTarget);
                        }}
                        endIcon={hasSingleTab ? undefined : <KeyboardArrowDownRoundedIcon sx={{ 
                          transition: "transform 0.2s ease-in-out",
                          transform: openGroup === groupItem.group ? "rotate(180deg)" : "rotate(0deg)"
                        }} />}
                        startIcon={getNavigationGroupIcon(groupItem.group)}
                        sx={{
                          width: { xs: "100%", sm: "auto" },
                          minHeight: 42,
                          borderRadius: "24px",
                          px: 2.2,
                          textTransform: "none",
                          whiteSpace: { xs: "normal", sm: "nowrap" },
                          justifyContent: { xs: "space-between", sm: "flex-start" },
                          borderWidth: "1.5px",
                          "&:hover": {
                            borderWidth: "1.5px",
                            backgroundColor: activeTabInGroup ? "primary.dark" : "rgba(31, 75, 143, 0.04)",
                            boxShadow: "0 4px 12px rgba(31, 75, 143, 0.12)"
                          },
                          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: activeTabInGroup ? "0 4px 14px rgba(31, 75, 143, 0.25)" : "none"
                        }}
                      >
                        <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.8 }}>
                          <Typography component="span" variant="body2" sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                            {groupItem.label}
                          </Typography>
                          <Typography component="span" variant="body2" sx={{ opacity: 0.8, fontSize: "0.875rem", fontWeight: 500 }}>
                            · {currentLabel}
                          </Typography>
                        </Box>
                      </Button>
                      <Menu
                        open={openGroup === groupItem.group}
                        anchorEl={anchorEl}
                        onClose={closeMenu}
                        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                        transformOrigin={{ vertical: "top", horizontal: "left" }}
                        slotProps={{
                          paper: {
                            sx: {
                              mt: 1.5,
                              borderRadius: "16px",
                              minWidth: 220,
                              boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.03)",
                              overflow: "visible",
                              backgroundImage: "none",
                              "&::before": {
                                content: '""',
                                display: "block",
                                position: "absolute",
                                top: 0,
                                left: 24,
                                width: 12,
                                height: 12,
                                bgcolor: "background.paper",
                                transform: "translateY(-50%) rotate(45deg)",
                                zIndex: 0,
                                borderLeft: "1px solid rgba(0,0,0,0.03)",
                                borderTop: "1px solid rgba(0,0,0,0.03)"
                              }
                            }
                          }
                        }}
                      >
                        <Stack spacing={0.5} sx={{ p: 1 }}>
                          {groupItem.tabs.map((groupTab) => (
                            <MenuItem
                              key={groupTab}
                              selected={groupTab === activeTab}
                              onClick={() => {
                                onSelectTab(groupTab);
                                closeMenu();
                              }}
                              sx={{
                                borderRadius: "10px",
                                py: 1.2,
                                px: 1.5,
                                gap: 1.5,
                                transition: "all 0.15s ease",
                                "&.Mui-selected": {
                                  backgroundColor: "rgba(31, 75, 143, 0.08)",
                                  color: "primary.main",
                                  fontWeight: 600,
                                  "&:hover": {
                                    backgroundColor: "rgba(31, 75, 143, 0.12)"
                                  }
                                },
                                "&:hover": {
                                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                                  transform: "translateX(4px)"
                                }
                              }}
                            >
                              <Box 
                                component="span" 
                                sx={{ 
                                  display: "inline-flex", 
                                  alignItems: "center",
                                  color: groupTab === activeTab ? "primary.main" : "text.secondary",
                                  transition: "color 0.2s"
                                }}
                              >
                                {getTabIcon(groupTab)}
                              </Box>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: groupTab === activeTab ? 700 : 500,
                                  fontSize: "0.875rem"
                                }}
                              >
                                {getTabDisplayLabel(groupTab)}
                              </Typography>
                            </MenuItem>
                          ))}
                        </Stack>
                      </Menu>
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          ) : (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={0.8}
              sx={{ display: { xs: mobileExpanded ? "grid" : "none", md: "grid" }, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" } }}
            >
              {roleQuickActions.map((action) => (
                <Paper
                  key={action.id}
                  variant="outlined"
                  sx={{
                    p: 1.1,
                    borderRadius: 2,
                    borderColor: action.active || action.emphasis ? "primary.main" : "divider",
                    backgroundColor: action.emphasis ? "rgba(31, 75, 143, 0.08)" : action.active ? "action.selected" : "background.paper"
                  }}
                >
                  <Button
                    fullWidth
                    size="small"
                    variant={action.emphasis || action.active ? "contained" : "text"}
                    startIcon={action.icon}
                    onClick={action.onClick}
                    sx={{ justifyContent: "flex-start", textTransform: "none", fontWeight: 700, px: 1 }}
                  >
                    <Stack alignItems="flex-start" spacing={0.15} sx={{ width: "100%" }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {action.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {action.description}
                      </Typography>
                    </Stack>
                  </Button>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
