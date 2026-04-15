"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
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

  const [openGroup, setOpenGroup] = useState<NavigationGroup | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

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
  const isAdminWorkspace = !effectiveRole || effectiveRole === "ADMINISTRADOR";

  const visibleNavigationTabs = useMemo(
    () =>
      tabs.filter((candidateTab) => {
        const config = TAB_CONFIG[candidateTab];
        return config.visibleInNavigation && canAccessTabForRole(candidateTab, effectiveRole);
      }),
    [effectiveRole]
  );

  const adminNavigationGroups = useMemo(
    () =>
      NAVIGATION_GROUP_ORDER.map((group) => {
        const groupTabs = visibleNavigationTabs.filter((candidateTab) => TAB_CONFIG[candidateTab].group === group);
        return {
          group,
          tabs: groupTabs
        };
      }).filter((item) => item.tabs.length > 0),
    [visibleNavigationTabs]
  );

  const roleQuickTabs = useMemo(
    () => visibleNavigationTabs.filter((candidateTab) => candidateTab !== "perfil"),
    [visibleNavigationTabs]
  );

  function navigateToTab(tab: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setMobileExpanded(false);
  }

  function openGroupMenu(group: NavigationGroup, event: MouseEvent<HTMLElement>) {
    setOpenGroup(group);
    setAnchorEl(event.currentTarget);
  }

  function closeGroupMenu() {
    setOpenGroup(null);
    setAnchorEl(null);
  }

  return (
    <Paper
      component="header"
      variant="outlined"
      sx={{
        mb: 2,
        width: "100vw",
        ml: "calc(50% - 50vw)",
        mr: "calc(50% - 50vw)",
        py: { xs: 1, sm: 1.05 },
        px: { xs: 1.5, sm: 2.5, md: 3.5 },
        borderRadius: 0,
        borderLeft: 0,
        borderRight: 0,
        backgroundColor: "background.paper"
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <FlacsoBrandLogo height={42} color="primary" />
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 800,
                lineHeight: 1.15,
                fontSize: { xs: "1rem", sm: "1.08rem" }
              }}
            >
              Plataforma Zoom de FLACSO Uruguay
            </Typography>
          </Stack>

          <Stack
            direction="row"
            spacing={0.6}
            alignItems="center"
            sx={{
              flexShrink: 0,
              width: { xs: "100%", sm: "auto" },
              justifyContent: { xs: "space-between", sm: "flex-end" }
            }}
          >
            {isAdminRole && (
              <Chip
                size="small"
                variant="outlined"
                label={`Rol: ${normalizedRoleLabel}`}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              />
            )}
            <UserMenu
              firstName={user.firstName}
              lastName={user.lastName}
              email={user.email}
              image={user.image}
              role={user.role ?? "ADMINISTRADOR"}
            />
            <IconButton
              onClick={() => setMobileExpanded((prev) => !prev)}
              sx={{
                display: { md: "none" },
                border: "2px solid",
                borderColor: "primary.main",
                borderRadius: 1.5,
                color: "primary.main",
                backgroundColor: "action.hover",
                "&:hover": {
                  backgroundColor: "primary.lighter"
                }
              }}
              aria-label={mobileExpanded ? "Ocultar navegacion" : "Mostrar navegacion"}
            >
              {mobileExpanded ? <CloseRoundedIcon fontSize="small" /> : <MenuRoundedIcon fontSize="small" />}
            </IconButton>
          </Stack>
        </Stack>

        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.72rem", sm: "0.76rem" }, lineHeight: 1.2 }}
          >
            Seccion: {TAB_CONFIG[currentTab].label}
          </Typography>
        </Box>
      </Stack>

      {isAdminWorkspace ? (
        <Box
          sx={{
            borderTop: "1px solid",
            borderColor: "divider",
            pt: 1,
            pb: 0.2,
            display: {
              xs: mobileExpanded ? "block" : "none",
              md: "block"
            }
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={0.8}
            sx={{
              overflowX: "visible",
              flexWrap: { xs: "nowrap", sm: "wrap", md: "nowrap" },
              py: 0.2,
              px: 0.1
            }}
          >
            {adminNavigationGroups.map((groupItem) => {
              const activeTabInGroup = groupItem.tabs.find((candidateTab) => candidateTab === currentTab) ?? null;
              const isGroupMenuOpen = openGroup === groupItem.group;
              const hasSingleTab = groupItem.tabs.length === 1;
              const singleTab = hasSingleTab ? groupItem.tabs[0] : null;
              const activeLabel = activeTabInGroup ? TAB_CONFIG[activeTabInGroup].label : "Elegir sección";

              return (
                <Box
                  key={groupItem.group}
                  sx={{ flexShrink: 0, width: { xs: "100%", sm: "calc(50% - 4px)", md: "auto" } }}
                >
                  <Button
                    variant={activeTabInGroup ? "contained" : "outlined"}
                    color={activeTabInGroup ? "primary" : "inherit"}
                    onClick={(event) => {
                      if (hasSingleTab && singleTab) {
                        navigateToTab(singleTab);
                        return;
                      }
                      openGroupMenu(groupItem.group, event);
                    }}
                    endIcon={hasSingleTab ? undefined : <KeyboardArrowDownRoundedIcon />}
                    startIcon={getNavigationGroupIcon(groupItem.group)}
                    sx={{
                      width: "100%",
                      minHeight: 46,
                      borderRadius: 999,
                      px: 1.5,
                      textTransform: "none",
                      whiteSpace: "nowrap",
                      justifyContent: "space-between"
                    }}
                  >
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.7 }}>
                      <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
                        {NAVIGATION_GROUP_LABEL[groupItem.group]}
                      </Typography>
                      <Typography component="span" variant="body2" sx={{ opacity: 0.85 }}>
                        · {activeLabel}
                      </Typography>
                    </Box>
                  </Button>
                  <Menu
                    open={isGroupMenuOpen}
                    anchorEl={anchorEl}
                    onClose={closeGroupMenu}
                    anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                    transformOrigin={{ vertical: "top", horizontal: "left" }}
                  >
                    {groupItem.tabs.map((groupTab) => (
                      <MenuItem
                        key={groupTab}
                        selected={groupTab === currentTab}
                        onClick={() => {
                          navigateToTab(groupTab);
                          closeGroupMenu();
                        }}
                      >
                        <Box component="span" sx={{ display: "inline-flex", alignItems: "center" }}>
                          {getTabIcon(groupTab)}
                        </Box>
                        <Box component="span">{TAB_CONFIG[groupTab].label}</Box>
                      </MenuItem>
                    ))}
                  </Menu>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ) : (
        <Box
          sx={{
            mt: 0.4,
            borderTop: "1px solid",
            borderColor: "divider",
            pt: 1,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
            gap: 1,
            display: {
              xs: mobileExpanded ? "grid" : "none",
              md: "grid"
            }
          }}
        >
          {roleQuickTabs.map((tabItem) => (
            <Button
              key={tabItem}
              fullWidth
              size="small"
              variant={tabItem === currentTab ? "contained" : "outlined"}
              startIcon={getTabIcon(tabItem)}
              onClick={() => navigateToTab(tabItem)}
              sx={{
                justifyContent: "flex-start",
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 999,
                py: 1.1
              }}
            >
              {TAB_CONFIG[tabItem].label}
            </Button>
          ))}
        </Box>
      )}
    </Paper>
  );
}
