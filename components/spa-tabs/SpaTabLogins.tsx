"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import DesktopWindowsRoundedIcon from "@mui/icons-material/DesktopWindowsRounded";
import SmartphoneRoundedIcon from "@mui/icons-material/SmartphoneRounded";
import TabletMacRoundedIcon from "@mui/icons-material/TabletMacRounded";
import QuestionMarkRoundedIcon from "@mui/icons-material/QuestionMarkRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import DevicesRoundedIcon from "@mui/icons-material/DevicesRounded";
import { formatManagedUserDate, formatManagedUserRole } from "./spa-tabs-utils";
import type { ManagedUser } from "@/src/services/userApi";

interface SpaTabLoginsProps {
  users: ManagedUser[];
  isLoadingUsers: boolean;
  onRefresh: () => void;
}

type Order = "asc" | "desc";

function detectOperatingSystem(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("android")) return "Android";
  if (/iphone|ipad|ipod/.test(ua)) return "iOS";
  if (ua.includes("macintosh") || ua.includes("mac os x")) return "macOS";
  if (ua.includes("linux")) return "Linux";
  return null;
}

function detectBrowser(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();
  if (ua.includes("edg/")) return "Edge";
  if (ua.includes("opr/")) return "Opera";
  if (ua.includes("firefox") || ua.includes("fxios")) return "Firefox";
  if (ua.includes("chrome") || ua.includes("crios")) return "Chrome";
  if (ua.includes("safari") && !ua.includes("chrome") && !ua.includes("crios")) return "Safari";
  return null;
}

function detectDeviceType(userAgent: string): "Escritorio" | "Movil" | "Tablet" | "Desconocido" {
  const ua = userAgent.toLowerCase();
  if (ua.includes("ipad") || ua.includes("tablet")) return "Tablet";
  if (/mobi|iphone|ipod|android.+mobile/.test(ua)) return "Movil";
  if (userAgent.length > 0) return "Escritorio";
  return "Desconocido";
}

function getDeviceIcon(type: string) {
  switch (type) {
    case "Escritorio":
      return <DesktopWindowsRoundedIcon fontSize="small" />;
    case "Movil":
      return <SmartphoneRoundedIcon fontSize="small" />;
    case "Tablet":
      return <TabletMacRoundedIcon fontSize="small" />;
    default:
      return <QuestionMarkRoundedIcon fontSize="small" />;
  }
}

export function SpaTabLogins({ users, isLoadingUsers, onRefresh }: SpaTabLoginsProps) {
  const [orderBy, setOrderBy] = useState<keyof ManagedUser>("lastLoginAt");
  const [order, setOrder] = useState<Order>("desc");

  const handleRequestSort = (property: keyof ManagedUser) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const aValue = a[orderBy] ?? "";
      const bValue = b[orderBy] ?? "";

      if (bValue < aValue) {
        return order === "desc" ? -1 : 1;
      }
      if (bValue > aValue) {
        return order === "desc" ? 1 : -1;
      }
      return 0;
    });
  }, [users, order, orderBy]);

  const stats = useMemo(() => {
    const total = users.length;
    const withLogin = users.filter((u) => u.lastLoginAt).length;
    const last24h = users.filter((u) => {
      if (!u.lastLoginAt) return false;
      const date = new Date(u.lastLoginAt);
      const diff = Date.now() - date.getTime();
      return diff < 24 * 60 * 60 * 1000;
    }).length;

    return { total, withLogin, last24h };
  }, [users]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 3 }}
        >
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={(theme) => ({
                  width: 42,
                  height: 42,
                  borderRadius: 2.5,
                  display: "grid",
                  placeItems: "center",
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  border: "1px solid",
                  borderColor: alpha(theme.palette.primary.main, 0.22)
                })}
              >
                <LoginRoundedIcon />
              </Box>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  Inicios de Sesion
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Seguimiento de actividad y accesos de usuarios al sistema.
                </Typography>
              </Box>
            </Stack>
          </Box>
          <Stack direction="row" spacing={1}>
            <IconButton onClick={onRefresh} disabled={isLoadingUsers} color="primary">
              <RefreshRoundedIcon />
            </IconButton>
          </Stack>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
            gap: 2,
            mb: 4
          }}
        >
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2.5,
              bgcolor: (theme) => alpha(theme.palette.primary.main, 0.03)
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Usuarios Totales
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {stats.total}
            </Typography>
          </Paper>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2.5,
              bgcolor: (theme) => alpha(theme.palette.success.main, 0.03)
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Han accedido
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {stats.withLogin}
            </Typography>
          </Paper>
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 2.5,
              bgcolor: (theme) => alpha(theme.palette.info.main, 0.03)
            }}
          >
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Activos (24h)
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>
              {stats.last24h}
            </Typography>
          </Paper>
        </Box>

        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5, maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === "email"}
                    direction={orderBy === "email" ? order : "asc"}
                    onClick={() => handleRequestSort("email")}
                  >
                    Usuario
                  </TableSortLabel>
                </TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === "lastLoginAt"}
                    direction={orderBy === "lastLoginAt" ? order : "asc"}
                    onClick={() => handleRequestSort("lastLoginAt")}
                  >
                    Ultimo Acceso
                  </TableSortLabel>
                </TableCell>
                <TableCell>Proveedor</TableCell>
                <TableCell>IP / Ubicacion</TableCell>
                <TableCell align="center">Dispositivo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedUsers.map((managedUser) => {
                const deviceType = managedUser.lastLoginUserAgent
                  ? detectDeviceType(managedUser.lastLoginUserAgent)
                  : "Desconocido";
                const os = managedUser.lastLoginUserAgent
                  ? detectOperatingSystem(managedUser.lastLoginUserAgent)
                  : null;
                const browser = managedUser.lastLoginUserAgent
                  ? detectBrowser(managedUser.lastLoginUserAgent)
                  : null;

                const name = [managedUser.firstName, managedUser.lastName].filter(Boolean).join(" ");

                return (
                  <TableRow key={managedUser.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {managedUser.email}
                        </Typography>
                        {name && (
                          <Typography variant="caption" color="text.secondary">
                            {name}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={formatManagedUserRole(managedUser.role)}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {managedUser.lastLoginAt ? (
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {formatManagedUserDate(managedUser.lastLoginAt)}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.disabled">
                          Nunca
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={managedUser.lastLoginProvider || "Password"}
                        color={managedUser.lastLoginProvider === "google" ? "primary" : "default"}
                        variant={managedUser.lastLoginProvider ? "filled" : "outlined"}
                        sx={{ textTransform: "capitalize" }}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LanguageRoundedIcon fontSize="inherit" color="action" />
                        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                          {managedUser.lastLoginIp || "-"}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="center">
                      {managedUser.lastLoginUserAgent ? (
                        <Tooltip
                          title={
                            <Box sx={{ p: 0.5 }}>
                              <Typography variant="caption" display="block">
                                <b>OS:</b> {os || "Desconocido"}
                              </Typography>
                              <Typography variant="caption" display="block">
                                <b>Navegador:</b> {browser || "Desconocido"}
                              </Typography>
                              <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.7 }}>
                                {managedUser.lastLoginUserAgent}
                              </Typography>
                            </Box>
                          }
                          arrow
                        >
                          <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
                            <Box sx={{ color: "primary.main", display: "flex" }}>
                              {getDeviceIcon(deviceType)}
                            </Box>
                            <Box sx={{ textAlign: "left" }}>
                              <Typography variant="caption" display="block" sx={{ fontWeight: 600, lineHeight: 1 }}>
                                {browser || "Desconocido"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.65rem" }}>
                                {os || "Desconocido"}
                              </Typography>
                            </Box>
                          </Stack>
                        </Tooltip>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {sortedUsers.length === 0 && !isLoadingUsers && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No se encontraron registros de acceso.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
