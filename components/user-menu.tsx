"use client";

import { MouseEvent, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Box,
  Button,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  IconButton
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import { UserAvatar } from "./user-avatar";
import { isViewRole, normalizeAssistantRole } from "@/src/lib/spa-home/navigation";

const VIEW_ROLE_COOKIE = "zoom_view_as";

const viewOptions = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "ASISTENTE_ZOOM", label: "Asistente Zoom" },
  { value: "DOCENTE", label: "Docente" },
  { value: "CONTADURIA", label: "Contaduria" }
] as const;

function normalizeViewRole(raw: string): string {
  const normalized = normalizeAssistantRole(raw.toUpperCase());
  return isViewRole(normalized) ? normalized : "ADMINISTRADOR";
}

function formatRoleLabel(role: string): string {
  const normalized = normalizeViewRole(role.toUpperCase());
  const found = viewOptions.find((option) => option.value === normalized);
  return found?.label ?? role;
}

function persistViewRoleCookie(role: string): void {
  if (typeof document === "undefined") return;
  if (role === "ADMINISTRADOR") {
    document.cookie = `${VIEW_ROLE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    return;
  }
  document.cookie = `${VIEW_ROLE_COOKIE}=${encodeURIComponent(role)}; path=/; max-age=604800; samesite=lax`;
}

interface UserMenuProps {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
  vertical?: boolean;
  iconOnly?: boolean;
}

export function UserMenu({ firstName, lastName, email, image, role, vertical = false, iconOnly = false }: UserMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pendingView, setPendingView] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = role === "ADMINISTRADOR";

  const displayName = useMemo(() => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
    if (email) return email.split("@")[0]?.trim() || email;
    return "Web FLACSO";
  }, [email, firstName, lastName]);

  const rawView = normalizeViewRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
  const currentView = viewOptions.some((option) => option.value === rawView) ? rawView : "ADMINISTRADOR";
  const currentViewLabel = viewOptions.find((option) => option.value === currentView)?.label ?? "Administrador";
  const primaryLabel = isAdmin ? "Web FLACSO" : displayName;
  const secondaryLabel = isAdmin ? `Modo: ${currentViewLabel}` : formatRoleLabel(role);
  const isChangingView = pendingView !== null && pendingView !== currentView;

  function onViewChange(nextValue: string) {
    if (!isAdmin) return;
    if (nextValue === currentView) {
      setPendingView(null);
      return;
    }

    setPendingView(nextValue);
    persistViewRoleCookie(nextValue);
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === "ADMINISTRADOR") {
      params.delete("viewAs");
    } else {
      params.set("viewAs", nextValue);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <>
      {iconOnly ? (
        <IconButton onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)} size="small" sx={{ p: 0.5 }}>
          <UserAvatar firstName={firstName} lastName={lastName} image={image} size={36} />
        </IconButton>
      ) : (
        <Button
          variant="outlined"
          onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
          startIcon={<UserAvatar firstName={firstName} lastName={lastName} image={image} size={vertical ? 36 : 32} />}
          sx={{
            textTransform: "none",
            borderRadius: 3,
            px: vertical ? 1.5 : 1.5,
            py: vertical ? 1 : 0.6,
            width: "100%",
            minWidth: vertical ? 0 : { xs: 0, sm: 240 },
            justifyContent: vertical ? "flex-start" : "space-between",
            borderColor: "divider",
            backgroundColor: "rgba(0,0,0,0.01)",
            "&:hover": {
              backgroundColor: "rgba(0,0,0,0.03)",
              borderColor: "primary.main"
            },
            ...(vertical && {
              border: "none",
              backgroundColor: "transparent",
              "&:hover": {
                backgroundColor: "rgba(31, 75, 143, 0.04)"
              }
            })
          }}
        >
          <Box sx={{ textAlign: "left", minWidth: 0, ml: 1, flexGrow: 1 }}>
            <Typography noWrap variant="body2" sx={{ fontWeight: 700, color: "text.primary", fontSize: vertical ? "0.875rem" : "0.875rem" }}>
              {displayName}
            </Typography>
            <Typography noWrap variant="caption" color="primary.main" sx={{ fontWeight: 600, textTransform: "uppercase", fontSize: "0.65rem", letterSpacing: "0.05em" }}>
              {secondaryLabel}
            </Typography>
          </Box>
          {vertical ? (
            Boolean(anchorEl) ? <ArrowDropDownIcon fontSize="small" sx={{ color: "text.secondary", ml: "auto" }} /> : <ArrowDropUpIcon fontSize="small" sx={{ color: "text.secondary", ml: "auto" }} />
          ) : (
            <ArrowDropDownIcon fontSize="small" sx={{ color: "text.secondary" }} />
          )}
        </Button>
      )}

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: vertical ? "left" : "right", vertical: vertical ? "bottom" : "top" }}
        anchorOrigin={{ horizontal: vertical ? "left" : "right", vertical: vertical ? "top" : "bottom" }}
        PaperProps={{
          sx: {
            width: { xs: "min(92vw, 360px)", sm: 360 },
            borderRadius: 4,
            mt: 1,
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)"
          }
        }}
      >
        <Box sx={{ px: 2.5, py: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <UserAvatar firstName={firstName} lastName={lastName} image={image} size={48} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
                {displayName}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {email || "-"}
              </Typography>
            </Box>
          </Stack>
        </Box>
        <Divider />

        {isAdmin ? (
          <Box sx={{ px: 2, py: 2, backgroundColor: "rgba(0,0,0,0.02)" }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800, ml: 0.5 }}>
              Modo de vista
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={currentView}
              onChange={(_event, nextValue: string | null) => {
                if (nextValue) onViewChange(nextValue);
              }}
              sx={{ mt: 0.8, display: "grid", gridTemplateColumns: "1fr", gap: 0.8 }}
            >
              {viewOptions.map((option) => {
                const isSelected = option.value === currentView;
                const isPendingOption = option.value === pendingView && isChangingView;
                return (
                  <ToggleButton
                    key={option.value}
                    value={option.value}
                    disabled={isChangingView}
                    sx={{
                      justifyContent: "space-between",
                      textTransform: "none",
                      borderRadius: 2,
                      border: "1px solid !important",
                      borderColor: isSelected ? "primary.main" : "divider",
                      backgroundColor: isSelected ? "primary.lighter" : "background.paper",
                      "&.Mui-selected": {
                        backgroundColor: "rgba(31, 75, 143, 0.08)",
                        color: "primary.main",
                      }
                    }}
                  >
                    <Typography component="span" variant="body2" sx={{ fontWeight: isSelected ? 700 : 500 }}>
                      {option.label}
                    </Typography>
                    {isPendingOption ? (
                      <AutorenewIcon
                        fontSize="small"
                        sx={{
                          animation: "muiSpin 1s linear infinite",
                          "@keyframes muiSpin": {
                            "0%": { transform: "rotate(0deg)" },
                            "100%": { transform: "rotate(360deg)" }
                          }
                        }}
                      />
                    ) : isSelected ? (
                      <CheckCircleIcon fontSize="small" color="primary" />
                    ) : (
                      <RadioButtonUncheckedIcon fontSize="small" color="disabled" />
                    )}
                  </ToggleButton>
                );
              })}
            </ToggleButtonGroup>
          </Box>
        ) : null}

        <MenuItem
          onClick={() => {
            setAnchorEl(null);
            router.push("/?tab=perfil");
          }}
        >
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ variant: "body2", fontWeight: 600 }}>Mi perfil</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={async () => {
            setAnchorEl(null);
            await signOut({ redirectTo: "/" });
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ color: "error.main", variant: "body2", fontWeight: 600 }}>
            Cerrar sesion
          </ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
