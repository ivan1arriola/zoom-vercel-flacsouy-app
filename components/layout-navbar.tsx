"use client";

import { useMemo, useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AppBar,
  Box,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  Fade
} from "@mui/material";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { FlacsoBrandLogo } from "@/components/flacso-brand-logo";
import { UserMenu } from "@/components/user-menu";
import {
  canAccessTabForRole,
  getNavigationGroupIcon,
  getTabIcon,
  isViewRole,
  NAVIGATION_GROUP_LABEL,
  NAVIGATION_GROUP_ORDER,
  normalizeAssistantRole,
  TAB_CONFIG,
  tabs,
  type NavigationGroup,
  type Tab,
  type ViewRole
} from "@/src/lib/spa-home/navigation";

const SIDEBAR_WIDTH = 260;

type LayoutNavbarUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
};

type LayoutNavbarProps = {
  user: LayoutNavbarUser;
};

function resolveTabFromSearchParams(searchParams: URLSearchParams): Tab {
  const rawTab = (searchParams.get("tab") ?? "").toLowerCase();
  if (!rawTab) return "dashboard";
  if (rawTab === "agenda") return "agenda_libre";
  if (rawTab === "asistencias") return "mis_asistencias";
  if (rawTab === "proximas") return "proximas_zoom";
  if (rawTab === "pasadas") return "pasadas_zoom";
  if (rawTab === "programa") return "programas";
  return tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "dashboard";
}

export function LayoutNavbar({ user }: LayoutNavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = useTheme();
  
  // Use state for mounted to avoid hydration mismatch with useMediaQuery
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    OPERACION: true,
    ZOOM: false,
    ADMIN: false,
    GENERAL: true
  });

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const normalizedUserRole = normalizeAssistantRole((user.role ?? "ADMINISTRADOR").toUpperCase());
  const isAdminRole = normalizedUserRole === "ADMINISTRADOR";

  const adminViewRole = useMemo<ViewRole>(() => {
    const rawViewAs = normalizeAssistantRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
    if (rawViewAs === "DOCENTE" || rawViewAs === "CONTADURIA") return rawViewAs;
    return "ADMINISTRADOR";
  }, [searchParams]);

  const effectiveRole = useMemo<ViewRole | "">(() => {
    if (!isViewRole(normalizedUserRole)) return "";
    if (!isAdminRole) return normalizedUserRole;
    return adminViewRole;
  }, [normalizedUserRole, isAdminRole, adminViewRole]);

  const currentTab = useMemo(() => resolveTabFromSearchParams(searchParams), [searchParams]);
  const normalizedRoleLabel = (effectiveRole || "ADMINISTRADOR").replace(/_/g, " ");

  const visibleNavigationTabs = useMemo(
    () =>
      tabs.filter((candidateTab) => {
        const config = TAB_CONFIG[candidateTab];
        return config.visibleInNavigation && canAccessTabForRole(candidateTab, effectiveRole);
      }),
    [effectiveRole]
  );

  const navigationGroups = useMemo(
    () =>
      NAVIGATION_GROUP_ORDER.map((group) => {
        const groupTabs = visibleNavigationTabs.filter((candidateTab) => TAB_CONFIG[candidateTab].group === group);
        return {
          group,
          label: NAVIGATION_GROUP_LABEL[group],
          tabs: groupTabs
        };
      }).filter((item) => item.tabs.length > 0),
    [visibleNavigationTabs]
  );

  function navigateToTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    if (isMobile) setMobileOpen(false);
  }

  const drawerContent = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
      {/* Sidebar Header */}
      <Box sx={{ px: 3, pt: 3, pb: 2, display: "flex", alignItems: "center", gap: 1.5 }}>
        <FlacsoBrandLogo height={40} color="primary" />
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.1, color: "primary.main", fontSize: "0.95rem" }}>
            FLACSO
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", display: "block", fontSize: "0.7rem", opacity: 0.8 }}>
            Plataforma Zoom
          </Typography>
        </Box>
      </Box>

      {/* Navigation List */}
      <Box sx={{ 
        flexGrow: 1, 
        overflowY: "auto", 
        py: 2, 
        px: 1.5,
        "&::-webkit-scrollbar": { width: "4px" },
        "&::-webkit-scrollbar-thumb": { backgroundColor: "rgba(0,0,0,0.05)", borderRadius: "10px" }
      }}>
        <List component="nav" disablePadding>
          {navigationGroups.map((groupItem) => {
            const hasActiveTab = groupItem.tabs.some((t) => t === currentTab);
            const isExpanded = expandedGroups[groupItem.group] || hasActiveTab;

            return (
              <Box key={groupItem.group} sx={{ mb: 1 }}>
                <ListItemButton
                  onClick={() => toggleGroup(groupItem.group)}
                  sx={{
                    borderRadius: "10px",
                    mb: 0.2,
                    py: 0.8,
                    px: 1.5,
                    color: hasActiveTab ? "primary.main" : "text.secondary",
                    "&:hover": { bgcolor: "action.hover" }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
                    {getNavigationGroupIcon(groupItem.group, "small")}
                  </ListItemIcon>
                  <ListItemText 
                    primary={groupItem.label} 
                    primaryTypographyProps={{ 
                      fontSize: "0.85rem", 
                      fontWeight: 700,
                      color: hasActiveTab ? "primary.main" : "text.primary"
                    }} 
                  />
                  {isExpanded ? <ExpandLess fontSize="small" sx={{ opacity: 0.5 }} /> : <ExpandMore fontSize="small" sx={{ opacity: 0.5 }} />}
                </ListItemButton>

                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {groupItem.tabs.map((tabId) => {
                      const isActive = tabId === currentTab;
                      return (
                        <ListItemButton
                          key={tabId}
                          onClick={() => navigateToTab(tabId)}
                          sx={{
                            pl: 5.5,
                            pr: 2,
                            py: 0.6,
                            my: 0.2,
                            borderRadius: "8px",
                            bgcolor: isActive ? "rgba(31, 75, 143, 0.08)" : "transparent",
                            color: isActive ? "primary.main" : "text.secondary",
                            "&:hover": {
                              bgcolor: isActive ? "rgba(31, 75, 143, 0.12)" : "action.hover"
                            },
                            position: "relative"
                          }}
                        >
                          {isActive && (
                            <Box sx={{ 
                              position: "absolute", 
                              left: 0, 
                              top: "20%", 
                              bottom: "20%", 
                              width: 3, 
                              bgcolor: "primary.main",
                              borderRadius: "0 4px 4px 0"
                            }} />
                          )}
                          <ListItemText 
                            primary={TAB_CONFIG[tabId].label} 
                            primaryTypographyProps={{ 
                              fontSize: "0.8rem", 
                              fontWeight: isActive ? 700 : 500 
                            }} 
                          />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Box>

      {/* Sidebar Footer */}
      {!isMobile && (
        <>
          <Divider sx={{ opacity: 0.4 }} />
          <Box sx={{ p: 2 }}>
            <Stack spacing={1}>
              {isAdminRole && (
                <Box sx={{ px: 1 }}>
                  <Chip
                    size="small"
                    variant="soft"
                    label={normalizedRoleLabel}
                    sx={{ 
                      fontWeight: 800,
                      fontSize: "0.6rem",
                      height: 20,
                      bgcolor: "rgba(31, 75, 143, 0.06)",
                      color: "primary.main",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em"
                    }}
                  />
                </Box>
              )}
              <UserMenu
                firstName={user.firstName}
                lastName={user.lastName}
                email={user.email}
                image={user.image}
                role={user.role ?? "ADMINISTRADOR"}
                vertical={true}
              />
            </Stack>
          </Box>
        </>
      )}
    </Box>
  );

  if (!mounted) return null;

  return (
    <>
      {isMobile ? (
        <>
          <AppBar 
            position="fixed" 
            elevation={0}
            sx={{ 
              bgcolor: "background.paper", 
              borderBottom: "1px solid", 
              borderColor: "divider",
              zIndex: theme.zIndex.drawer + 1
            }}
          >
            <Toolbar sx={{ justifyContent: "space-between", minHeight: 64, px: 2 }}>
              <IconButton
                color="inherit"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ color: "primary.main" }}
              >
                <MenuRoundedIcon />
              </IconButton>
              
              <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "center" }}>
                <img src="/flacso-logo.png" alt="FLACSO" height={32} style={{ objectFit: "contain" }} />
              </Box>

              <Box sx={{ minWidth: 40, display: "flex", justifyContent: "flex-end" }}>
                <UserMenu
                  firstName={user.firstName}
                  lastName={user.lastName}
                  email={user.email}
                  image={user.image}
                  role={user.role ?? "ADMINISTRADOR"}
                  iconOnly={true}
                />
              </Box>
            </Toolbar>
          </AppBar>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
              "& .MuiDrawer-paper": { boxSizing: "border-box", width: SIDEBAR_WIDTH, borderRight: "none", boxShadow: "10px 0 30px rgba(0,0,0,0.1)" },
            }}
          >
            {drawerContent}
          </Drawer>
        </>
      ) : (
        <Box
          component="nav"
          sx={{ 
            width: SIDEBAR_WIDTH, 
            flexShrink: 0,
            borderRight: "1px solid",
            borderColor: "divider"
          }}
        >
          <Box sx={{ 
            width: SIDEBAR_WIDTH, 
            height: "100vh", 
            position: "fixed", 
            left: 0, 
            top: 0,
            zIndex: theme.zIndex.drawer
          }}>
            {drawerContent}
          </Box>
        </Box>
      )}
    </>
  );
}
