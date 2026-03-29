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
  Typography
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import { UserAvatar } from "./user-avatar";

const VIEW_ROLE_COOKIE = "zoom_view_as";

const viewOptions = [
  { value: "ADMINISTRADOR", label: "Administrador" },
  { value: "DOCENTE", label: "Docente" },
  { value: "CONTADURIA", label: "Contaduria" }
] as const;

function normalizeViewRole(raw: string): string {
  return raw;
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
}

export function UserMenu({ firstName, lastName, email, image, role }: UserMenuProps) {
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
    return "Usuario";
  }, [email, firstName, lastName]);

  const rawView = normalizeViewRole((searchParams.get("viewAs") ?? "ADMINISTRADOR").toUpperCase());
  const currentView = viewOptions.some((option) => option.value === rawView) ? rawView : "ADMINISTRADOR";
  const currentViewLabel = viewOptions.find((option) => option.value === currentView)?.label ?? "Administrador";
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
      <Button
        variant="outlined"
        onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
        startIcon={<UserAvatar firstName={firstName} lastName={lastName} image={image} size={34} />}
        endIcon={<ArrowDropDownIcon fontSize="small" sx={{ color: "text.secondary" }} />}
        sx={{
          textTransform: "none",
          borderRadius: 3,
          px: 1.2,
          py: 0.7,
          minWidth: 280,
          justifyContent: "space-between",
          "& .MuiButton-startIcon": { mr: 1 }
        }}
      >
        <Box sx={{ textAlign: "left", minWidth: 0 }}>
          <Typography noWrap variant="body2" sx={{ fontWeight: 700 }}>
            {displayName}
          </Typography>
          <Typography noWrap variant="caption" color="text.secondary">
            {secondaryLabel}
          </Typography>
        </Box>
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        PaperProps={{ sx: { width: 360, borderRadius: 2.5, mt: 1 } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <UserAvatar firstName={firstName} lastName={lastName} image={image} size={40} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                {displayName}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {email || "-"}
              </Typography>
            </Box>
          </Stack>
        </Box>
        <Divider />

        {isAdmin ? (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="overline" color="text.secondary">
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
                      borderRadius: 1.5
                    }}
                  >
                    <Typography component="span" variant="body2">
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
          <ListItemText>Editar perfil</ListItemText>
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
          <ListItemText primaryTypographyProps={{ color: "error.main" }}>
            Cerrar sesion
          </ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
