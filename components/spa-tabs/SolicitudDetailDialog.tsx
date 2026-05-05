"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Paper,
  Stack,
  Typography,
  Tooltip,
  Alert
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import LaunchIcon from "@mui/icons-material/Launch";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";

import type { Solicitud } from "@/src/services/solicitudesApi";

interface SolicitudDetailDialogProps {
  solicitudId: string | null;
  open: boolean;
  onClose: () => void;
  initialData?: Solicitud | null;
}

export function SolicitudDetailDialog({
  solicitudId,
  open,
  onClose,
  initialData
}: SolicitudDetailDialogProps) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(initialData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (open && solicitudId && (!solicitud || solicitud.id !== solicitudId)) {
      void fetchSolicitud();
    }
  }, [open, solicitudId]);

  useEffect(() => {
    if (initialData) setSolicitud(initialData);
  }, [initialData]);

  async function fetchSolicitud() {
    if (!solicitudId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/solicitudes-sala/${solicitudId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar los detalles");
      setSolicitud(data.request);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const handleCopy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat("es-UY", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "America/Montevideo"
    }).format(new Date(dateStr));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PROVISIONADA": return "success";
      case "REGISTRADA": return "info";
      case "CANCELADA_DOCENTE":
      case "CANCELADA_ADMIN": return "error";
      case "SIN_CAPACIDAD_ZOOM": return "warning";
      default: return "default";
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, p: 1 }
      }}
    >
      <DialogTitle sx={{ m: 0, p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Detalles de la Solicitud
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : solicitud ? (
          <Stack spacing={4}>
            {/* Header Section */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 900, color: "primary.main" }}>
                  {solicitud.titulo}
                </Typography>
                <Chip 
                  label={solicitud.estadoSolicitudVista || solicitud.estadoSolicitud} 
                  color={getStatusColor(solicitud.estadoSolicitud) as any}
                  sx={{ fontWeight: 700 }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                ID: {solicitud.id}
              </Typography>
            </Box>

            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Stack spacing={2}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <SchoolOutlinedIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>
                        PROGRAMA
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {solicitud.programaNombre || "Sin programa"}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <PersonOutlineOutlinedIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>
                        RESPONSABLE
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {solicitud.responsableNombre}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <CalendarMonthOutlinedIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>
                        MODALIDAD
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {solicitud.modalidadReunion} ({solicitud.tipoInstancias})
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Stack spacing={2}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <VideocamOutlinedIcon color="action" />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>
                        CUENTA ZOOM
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {solicitud.zoomHostAccount || "No asignada"}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <InfoOutlinedIcon color="action" />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>
                        MEETING ID
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: "monospace", letterSpacing: 1 }}>
                          {solicitud.meetingPrincipalId || "-"}
                        </Typography>
                        {solicitud.meetingPrincipalId && (
                          <IconButton size="small" onClick={() => handleCopy(solicitud.meetingPrincipalId!, "mid")}>
                            {copied === "mid" ? <CheckIcon fontSize="inherit" color="success" /> : <ContentCopyIcon fontSize="inherit" />}
                          </IconButton>
                        )}
                      </Stack>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <AccessTimeOutlinedIcon color="action" />
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: "block" }}>
                        CREADA EL
                      </Typography>
                      <Typography variant="body2">
                        {formatDate(solicitud.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                </Stack>
              </Grid>
            </Grid>

            {solicitud.zoomJoinUrl && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: "rgba(31, 75, 143, 0.03)", border: "1px dashed", borderColor: "primary.light" }}>
                <Typography variant="caption" color="primary" sx={{ fontWeight: 800, mb: 1, display: "block" }}>
                  ENLACE DE ACCESO
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      flex: 1, 
                      overflow: "hidden", 
                      textOverflow: "ellipsis", 
                      whiteSpace: "nowrap",
                      fontFamily: "monospace",
                      color: "primary.main"
                    }}
                  >
                    {solicitud.zoomJoinUrl}
                  </Typography>
                  <Button 
                    size="small" 
                    variant="contained" 
                    startIcon={<LaunchIcon />}
                    href={solicitud.zoomJoinUrl}
                    target="_blank"
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
                  >
                    Abrir Zoom
                  </Button>
                </Stack>
              </Paper>
            )}

            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>
                Instancias Programadas ({solicitud.zoomInstanceCount || 0})
              </Typography>
              <Stack spacing={1}>
                {solicitud.zoomInstances?.map((instance, idx) => (
                  <Paper 
                    key={idx} 
                    variant="outlined" 
                    sx={{ 
                      p: 1.5, 
                      borderRadius: 2, 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between",
                      backgroundColor: instance.status === "deleted" ? "grey.50" : "inherit",
                      opacity: instance.status === "deleted" ? 0.6 : 1
                    }}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {new Intl.DateTimeFormat("es-UY", { 
                          weekday: "long", 
                          day: "numeric", 
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit"
                        }).format(new Date(instance.startTime))}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Duración: {instance.durationMinutes} min
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {instance.requiereAsistencia && (
                        <Chip size="small" label="Asistencia" color="secondary" variant="outlined" sx={{ fontWeight: 700, height: 20, fontSize: "0.6rem" }} />
                      )}
                      <Typography variant="caption" sx={{ fontWeight: 700, color: instance.status === "deleted" ? "error.main" : "success.main" }}>
                        {instance.status === "deleted" ? "Cancelada" : "Activa"}
                      </Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Box>
          </Stack>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 700 }}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}
