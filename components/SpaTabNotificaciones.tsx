"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Typography,
  Pagination,
  CircularProgress
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";

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
  usuario: {
    id: string;
    email: string;
    name: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function SpaTabNotificaciones() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1
  });
  const [isLoading, setIsLoading] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState<"" | "PENDIENTE" | "ENVIADA" | "FALLIDA">("");
  const [tipoFiltro, setTipoFiltro] = useState<"" | "EMAIL" | "IN_APP" | "ALERTA_OPERATIVA">("");

  async function fetchNotificaciones(page: number = 1) {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (tipoFiltro) params.set("tipo", tipoFiltro);

      const response = await fetch(`/api/v1/notificaciones?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al cargar notificaciones");
      }

      setNotificaciones(data.notificaciones);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchNotificaciones(1);
  }, [estadoFiltro, tipoFiltro]);

  const estadoStats = useMemo(() => {
    return {
      pendientes: notificaciones.filter(n => n.estadoEnvio === "PENDIENTE").length,
      enviadas: notificaciones.filter(n => n.estadoEnvio === "ENVIADA").length,
      fallidas: notificaciones.filter(n => n.estadoEnvio === "FALLIDA").length
    };
  }, [notificaciones]);

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case "ENVIADA":
        return "success";
      case "FALLIDA":
        return "error";
      case "PENDIENTE":
        return "warning";
      default:
        return "default";
    }
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case "ENVIADA":
        return <CheckCircleOutlineIcon fontSize="small" />;
      case "FALLIDA":
        return <ErrorOutlineIcon fontSize="small" />;
      case "PENDIENTE":
        return <ScheduleOutlinedIcon fontSize="small" />;
      default:
        return null;
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case "EMAIL":
        return "primary";
      case "IN_APP":
        return "info";
      case "ALERTA_OPERATIVA":
        return "warning";
      default:
        return "default";
    }
  };

  const getUserDisplay = (usuario: Notificacion["usuario"]) => {
    if (usuario.name) return usuario.name;
    if (usuario.firstName || usuario.lastName) {
      return `${usuario.firstName ?? ""} ${usuario.lastName ?? ""}`.trim();
    }
    return usuario.email;
  };

  const formatDateTime = (dateString: string) => {
    return new Intl.DateTimeFormat("es-UY", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(dateString));
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 3.5 }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, flex: 1 }}>
            Registro de notificaciones
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon fontSize="small" />}
            onClick={() => fetchNotificaciones(pagination.page)}
            disabled={isLoading}
          >
            Actualizar
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Historial de todas las notificaciones enviadas en el sistema (correos, alertas internas, etc.)
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(3, minmax(0, 1fr))",
              md: "repeat(3, minmax(0, 1fr))"
            },
            gap: 1,
            mb: 2
          }}
        >
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Pendientes
            </Typography>
            <Typography variant="h6" color="warning.main" sx={{ fontWeight: 700, mt: 0.4 }}>
              {estadoStats.pendientes}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Enviadas
            </Typography>
            <Typography variant="h6" color="success.main" sx={{ fontWeight: 700, mt: 0.4 }}>
              {estadoStats.enviadas}
            </Typography>
          </Paper>
          <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Fallidas
            </Typography>
            <Typography variant="h6" color="error.main" sx={{ fontWeight: 700, mt: 0.4 }}>
              {estadoStats.fallidas}
            </Typography>
          </Paper>
        </Box>

        <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 2.5, mb: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} useFlexGap>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.6 }}>
                Filtrar por estado
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={estadoFiltro}
                onChange={(_event, value) => {
                  if (value === null) setEstadoFiltro("");
                  else setEstadoFiltro(value);
                }}
              >
                <ToggleButton value="">Todos</ToggleButton>
                <ToggleButton value="PENDIENTE">Pendientes</ToggleButton>
                <ToggleButton value="ENVIADA">Enviadas</ToggleButton>
                <ToggleButton value="FALLIDA">Fallidas</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.6 }}>
                Filtrar por tipo
              </Typography>
              <ToggleButtonGroup
                size="small"
                value={tipoFiltro}
                onChange={(_event, value) => {
                  if (value === null) setTipoFiltro("");
                  else setTipoFiltro(value);
                }}
              >
                <ToggleButton value="">Todos</ToggleButton>
                <ToggleButton value="EMAIL">Email</ToggleButton>
                <ToggleButton value="IN_APP">In-app</ToggleButton>
                <ToggleButton value="ALERTA_OPERATIVA">Alertas</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Stack>
        </Paper>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : notificaciones.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
            No hay notificaciones con estos filtros.
          </Typography>
        ) : (
          <>
            <Box sx={{ overflowX: "auto", mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "grey.50" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Usuario</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Canal</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Asunto</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Intentos
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Creado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notificaciones.map((notif) => (
                    <TableRow
                      key={notif.id}
                      hover
                      sx={{
                        backgroundColor:
                          notif.estadoEnvio === "FALLIDA"
                            ? "rgba(244, 67, 54, 0.04)"
                            : notif.estadoEnvio === "PENDIENTE"
                              ? "rgba(255, 193, 7, 0.04)"
                              : undefined
                      }}
                    >
                      <TableCell sx={{ fontSize: "0.875rem" }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {getUserDisplay(notif.usuario)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {notif.usuario.email}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={getTipoColor(notif.tipoNotificacion) as any}
                          label={notif.tipoNotificacion}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.875rem" }}>
                        <Typography variant="body2">{notif.canalDestino}</Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.875rem", maxWidth: 250 }}>
                        <Typography variant="body2" noWrap title={notif.asunto}>
                          {notif.asunto}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          icon={getEstadoIcon(notif.estadoEnvio) as any}
                          color={getEstadoColor(notif.estadoEnvio) as any}
                          label={notif.estadoEnvio}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{notif.intentoCount}</Typography>
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.875rem" }}>
                        <Typography variant="caption">
                          {formatDateTime(notif.createdAt)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            {pagination.pages > 1 && (
              <Stack direction="row" justifyContent="center" sx={{ mt: 2 }}>
                <Pagination
                  count={pagination.pages}
                  page={pagination.page}
                  onChange={(_event, page) => fetchNotificaciones(page)}
                  disabled={isLoading}
                />
              </Stack>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
