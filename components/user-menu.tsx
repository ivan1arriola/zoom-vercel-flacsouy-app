"use client";

import { MouseEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  Typography,
  IconButton
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import { UserAvatar } from "./user-avatar";
import { normalizeAssistantRole } from "@/src/lib/spa-home/navigation";

function formatRoleLabel(role: string): string {
  const normalized = normalizeAssistantRole(role.toUpperCase());
  if (normalized === "ADMINISTRADOR") return "Administrador";
  if (normalized === "ASISTENTE_ZOOM") return "Asistente Zoom";
  if (normalized === "DOCENTE") return "Docente";
  if (normalized === "CONTADURIA") return "Contaduria";
  return normalized;
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
  const router = useRouter();

  const displayName = useMemo(() => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
    if (email) return email.split("@")[0]?.trim() || email;
    return "Web FLACSO";
  }, [email, firstName, lastName]);

  const primaryLabel = displayName;
  const secondaryLabel = formatRoleLabel(role);

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
