"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import Tooltip from "@mui/material/Tooltip";
import { formatDateTime } from "@/src/lib/spa-home/recurrence";
import type { PastMeeting } from "@/src/services/solicitudesApi";
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";

interface PastMeetingForm {
  titulo: string;
  modalidadReunion: string;
  docenteEmail: string;
  responsableEmail: string;
  monitorEmail: string;
  zoomMeetingId: string;
  inicioRealAt: string;
  finRealAt: string;
  programaNombre: string;
  zoomJoinUrl: string;
  descripcion: string;
}

interface SpaTabHistoricoProps {
  pastMeetings: PastMeeting[];
  isLoadingPastMeetings: boolean;
  updatingPastMeetingId: string | null;
  onRefreshPastMeetings: () => void;
  onUpdatePastMeeting: (input: {
    eventoId: string;
    programaNombre: string;
    monitorEmail?: string;
  }) => Promise<boolean>;
  pastMeetingForm: PastMeetingForm;
  setPastMeetingForm: (form: PastMeetingForm | ((prev: PastMeetingForm) => PastMeetingForm)) => void;
  docenteOptions: Array<{ value: string; label: string; nombre: string }>;
  monitorOptions: Array<{ value: string; label: string; nombre: string }>;
  programaOptions: string[];
  zoomSeed: {
    meetingId: string;
    topic: string;
    startTime: string;
    endTime: string;
    joinUrl: string;
    accountEmail: string;
  } | null;
  onClearZoomSeed: () => void;
  isSubmittingPastMeeting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function SpaTabHistorico({
  pastMeetings,
  isLoadingPastMeetings,
  updatingPastMeetingId,
  onRefreshPastMeetings,
  onUpdatePastMeeting,
  pastMeetingForm,
  setPastMeetingForm,
  docenteOptions,
  monitorOptions,
  programaOptions,
  zoomSeed,
  onClearZoomSeed,
  isSubmittingPastMeeting,
  onSubmit
}: SpaTabHistoricoProps) {
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editMeetingForm, setEditMeetingForm] = useState({
    programaNombre: "",
    monitorEmail: ""
  });
  const [copyFeedback, setCopyFeedback] = useState<Record<string, string>>({});

  const handleCopy = async (text: string, key: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopyFeedback(prev => ({ ...prev, [key]: "¡Copiado!" }));
      setTimeout(() => setCopyFeedback(prev => ({ ...prev, [key]: "" })), 2000);
    }
  };

  const isZoomSeedMode = Boolean(zoomSeed);
  const recurrenceCountByMeetingId = useMemo(() => {
    const map = new Map<string, number>();
    for (const meeting of pastMeetings) {
      const meetingId = (meeting.zoomMeetingId ?? "").trim();
      if (!meetingId) continue;
      map.set(meetingId, (map.get(meetingId) ?? 0) + 1);
    }
    return map;
  }, [pastMeetings]);

  useEffect(() => {
    if (zoomSeed) {
      setManualFormOpen(true);
    }
  }, [zoomSeed]);

  async function submitEditMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMeetingId) return;
    const updated = await onUpdatePastMeeting({
      eventoId: editingMeetingId,
      programaNombre: editMeetingForm.programaNombre.trim(),
      monitorEmail: editMeetingForm.monitorEmail.trim() || undefined
    });
    if (!updated) return;
    setEditingMeetingId(null);
  }

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Reuniones pasadas
          </Typography>
          <Button variant="outlined" onClick={onRefreshPastMeetings} disabled={isLoadingPastMeetings}>
            {isLoadingPastMeetings ? "Actualizando..." : "Actualizar lista"}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Historial de reuniones finalizadas con Meeting ID de Zoom.
        </Typography>
        <Stack spacing={1.5}>
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Historial registrado
              </Typography>
              <Chip size="small" variant="outlined" label={`${pastMeetings.length} reunion(es)`} />
            </Stack>

            {isLoadingPastMeetings ? (
              <Stack spacing={1.5}>
                {[1, 2, 3].map((i) => (
                  <Paper
                    key={i}
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: (theme) => alpha(theme.palette.background.paper, 0.5)
                    }}
                  >
                    <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                      <Box sx={{ flexGrow: 1 }}>
                        <Skeleton variant="text" width="40%" height={28} animation="wave" />
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Skeleton variant="rounded" width={80} height={24} sx={{ borderRadius: 1.5 }} animation="wave" />
                          <Skeleton variant="rounded" width={100} height={24} sx={{ borderRadius: 1.5 }} animation="wave" />
                        </Stack>
                      </Box>
                      <Skeleton variant="rounded" width={150} height={32} sx={{ borderRadius: 2 }} animation="wave" />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : pastMeetings.length === 0 ? (
              <Alert severity="info">No hay reuniones pasadas registradas.</Alert>
            ) : (
              <Stack spacing={1.2}>
                {pastMeetings.map((meeting) => {
                  const isEditing = editingMeetingId === meeting.id;
                  const isUpdating = updatingPastMeetingId === meeting.id;
                  const recurringCount = recurrenceCountByMeetingId.get(meeting.zoomMeetingId) ?? 1;
                  const hostAccount =
                    meeting.zoomHostAccount?.trim() ||
                    meeting.zoomAccountEmail?.trim() ||
                    meeting.zoomAccountName?.trim() ||
                    null;
                  const zoomJoinUrl = meeting.zoomJoinUrl?.trim() ?? "";

                  return (
                    <Paper key={meeting.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        spacing={1}
                        alignItems={{ xs: "flex-start", md: "center" }}
                        justifyContent="space-between"
                      >
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {meeting.titulo}
                          </Typography>
                          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                            <Chip size="small" variant="outlined" label={meeting.modalidadReunion} />
                            <Chip size="small" variant="outlined" label={`${meeting.minutosReales} min`} />
                            <Chip
                              size="small"
                              color={recurringCount > 1 ? "primary" : "default"}
                              variant="outlined"
                              label={
                                recurringCount > 1
                                  ? `${recurringCount} reuniones`
                                  : "Reunion unica"
                              }
                            />
                          </Stack>
                        </Box>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {zoomJoinUrl ? (
                            <Box sx={{ 
                              display: "flex", 
                              alignItems: "center", 
                              gap: 0.5, 
                              bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.08),
                              pl: 1.5,
                              pr: 0.5,
                              py: 0.5,
                              borderRadius: 2,
                              border: "1px solid",
                              borderColor: (theme) => alpha(theme.palette.secondary.main, 0.2),
                              maxWidth: { xs: "100%", md: 350 }
                            }}>
                              <Typography 
                                variant="body2" 
                                component="a"
                                href={zoomJoinUrl}
                                target="_blank"
                                rel="noreferrer"
                                sx={{ 
                                  fontWeight: 700, 
                                  color: "secondary.main",
                                  textDecoration: "none",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  "&:hover": { textDecoration: "underline" }
                                }}
                              >
                                {zoomJoinUrl}
                              </Typography>
                              <Tooltip title={copyFeedback[meeting.id] || "Copiar link"}>
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleCopy(zoomJoinUrl, meeting.id)}
                                  color={copyFeedback[meeting.id] ? "success" : "secondary"}
                                >
                                  {copyFeedback[meeting.id] ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : null}
                          <Button
                            size="small"
                            variant={isEditing ? "contained" : "outlined"}
                            onClick={() => {
                              if (isEditing) {
                                setEditingMeetingId(null);
                                return;
                              }
                              setEditingMeetingId(meeting.id);
                              setEditMeetingForm({
                                programaNombre: meeting.programaNombre ?? "",
                                monitorEmail: meeting.monitorEmail ?? ""
                              });
                            }}
                            disabled={Boolean(updatingPastMeetingId)}
                          >
                            {isEditing ? "Ocultar edicion" : "Editar"}
                          </Button>
                        </Stack>
                      </Stack>

                      <Box
                        sx={{
                          mt: 1.2,
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "repeat(2, minmax(0, 1fr))",
                            lg: "repeat(4, minmax(0, 1fr))"
                          },
                          gap: 1
                        }}
                      >
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            ID Zoom
                          </Typography>
                          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                            {meeting.zoomMeetingId || "-"}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Programa
                          </Typography>
                          <Typography variant="body2">{meeting.programaNombre || "-"}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Docente
                          </Typography>
                          <Typography variant="body2">{meeting.docenteNombre || meeting.docenteEmail || "-"}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Asistente por reunion
                          </Typography>
                          <MeetingAssistantStatusChip
                            requiresAssistance
                            assistantName={meeting.monitorNombre}
                            assistantEmail={meeting.monitorEmail}
                            pendingLabel="Pendiente"
                            noAssistanceLabel="No aplica"
                          />
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Cuenta streaming asociada
                          </Typography>
                          <Typography variant="body2">{hostAccount || "-"}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Cantidad de reuniones
                          </Typography>
                          <Typography variant="body2">
                            {recurringCount} {recurringCount === 1 ? "instancia" : "instancias"}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Inicio
                          </Typography>
                          <Typography variant="body2">{formatDateTime(meeting.inicioAt)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Fin
                          </Typography>
                          <Typography variant="body2">{formatDateTime(meeting.finAt)}</Typography>
                        </Box>
                        <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
                          <ZoomAccountPasswordField
                            hostAccount={hostAccount}
                            label="Contrasena cuenta streaming"
                          />
                        </Box>
                      </Box>

                      <Collapse in={isEditing} timeout="auto" unmountOnExit>
                        <Paper variant="outlined" sx={{ mt: 1.2, p: 1.2, borderRadius: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                            Editar reunion
                          </Typography>
                          <Box component="form" onSubmit={submitEditMeeting}>
                            <Box
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: 1
                              }}
                            >
                              {programaOptions.length > 0 ? (
                                <TextField
                                  select
                                  label="Programa"
                                  required
                                  size="small"
                                  value={editMeetingForm.programaNombre}
                                  onChange={(event) =>
                                    setEditMeetingForm((prev) => ({
                                      ...prev,
                                      programaNombre: event.target.value
                                    }))
                                  }
                                >
                                  {programaOptions.map((programa) => (
                                    <MenuItem key={programa} value={programa}>
                                      {programa}
                                    </MenuItem>
                                  ))}
                                </TextField>
                              ) : (
                                <TextField
                                  label="Programa"
                                  required
                                  size="small"
                                  value={editMeetingForm.programaNombre}
                                  onChange={(event) =>
                                    setEditMeetingForm((prev) => ({
                                      ...prev,
                                      programaNombre: event.target.value
                                    }))
                                  }
                                />
                              )}
                              <TextField
                                select
                                label="Asistente Zoom"
                                size="small"
                                value={editMeetingForm.monitorEmail}
                                onChange={(event) =>
                                  setEditMeetingForm((prev) => ({
                                    ...prev,
                                    monitorEmail: event.target.value
                                  }))
                                }
                                helperText="Puedes cambiar o cargar asistencia a posteriori."
                              >
                                <MenuItem value="">
                                  Sin cambios en asistencia
                                </MenuItem>
                                {editMeetingForm.monitorEmail &&
                                !monitorOptions.some(
                                  (option) => option.value === editMeetingForm.monitorEmail
                                ) ? (
                                  <MenuItem value={editMeetingForm.monitorEmail}>
                                    {editMeetingForm.monitorEmail}
                                  </MenuItem>
                                ) : null}
                                {monitorOptions.map((option) => (
                                  <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </Box>
                            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.2 }}>
                              <Button type="submit" variant="contained" disabled={isUpdating}>
                                {isUpdating ? "Guardando..." : "Guardar cambios"}
                              </Button>
                            </Stack>
                          </Box>
                        </Paper>
                      </Collapse>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "flex-start", sm: "center" }}
              justifyContent="space-between"
              sx={{ mb: 0.5 }}
            >
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Registrar reunion pasada
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  size="small"
                  color={isZoomSeedMode ? "success" : "primary"}
                  variant="outlined"
                  label={isZoomSeedMode ? "Sincronizado con Zoom" : "Registro manual"}
                />
                {isZoomSeedMode ? (
                  <Button
                    size="small"
                    variant="outlined"
                    color="secondary"
                    onClick={onClearZoomSeed}
                  >
                    Cambiar a manual
                  </Button>
                ) : null}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setManualFormOpen((prev) => !prev)}
                >
                  {manualFormOpen ? "Ocultar formulario" : "Mostrar formulario"}
                </Button>
              </Stack>
            </Stack>
            {!manualFormOpen ? (
              <Typography variant="body2" color="text.secondary">
                Formulario oculto. Usar "Mostrar formulario" para cargar una reunion pasada manualmente.
              </Typography>
            ) : null}

            <Collapse in={manualFormOpen} timeout="auto" unmountOnExit>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {isZoomSeedMode
                  ? "Datos base sincronizados con Zoom y bloqueados para evitar inconsistencias. Completa solo los datos faltantes."
                  : "Este registro exige un Meeting ID de Zoom con instancias ya pasadas y una persona de monitoreo asignada."}
              </Typography>

              {zoomSeed ? (
                <Paper variant="outlined" sx={{ p: 1.2, borderRadius: 1.8, mb: 1.5, backgroundColor: "success.50" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.6 }}>
                    Datos confirmados por Zoom (no editables)
                  </Typography>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, minmax(0, 1fr))",
                        lg: "repeat(4, minmax(0, 1fr))"
                      },
                      gap: 1
                    }}
                  >
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Titulo
                      </Typography>
                      <Typography variant="body2">{zoomSeed.topic || "-"}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Meeting ID
                      </Typography>
                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                        {zoomSeed.meetingId || "-"}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Inicio
                      </Typography>
                      <Typography variant="body2">{formatDateTime(zoomSeed.startTime)}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Fin
                      </Typography>
                      <Typography variant="body2">{formatDateTime(zoomSeed.endTime)}</Typography>
                    </Box>
                    <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
                      <Typography variant="caption" color="text.secondary">
                        Cuenta Zoom
                      </Typography>
                      <Typography variant="body2">{zoomSeed.accountEmail || "-"}</Typography>
                    </Box>
                    {zoomSeed.joinUrl ? (
                      <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 2" } }}>
                        <Typography variant="caption" color="text.secondary">
                          Link Zoom
                        </Typography>
                        <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                          {zoomSeed.joinUrl}
                        </Typography>
                      </Box>
                    ) : null}
                  </Box>
                </Paper>
              ) : null}

              <Box component="form" onSubmit={onSubmit}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                    gap: 1.5
                  }}
                >
                  {!isZoomSeedMode ? (
                    <TextField
                      label="Titulo"
                      required
                      value={pastMeetingForm.titulo}
                      onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, titulo: e.target.value }))}
                    />
                  ) : null}
                  <TextField
                    label="Modalidad"
                    select
                    required
                    value={pastMeetingForm.modalidadReunion}
                    onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, modalidadReunion: e.target.value }))}
                  >
                    <MenuItem value="VIRTUAL">Virtual</MenuItem>
                    <MenuItem value="HIBRIDA">Hibrida</MenuItem>
                  </TextField>
                  <TextField
                    label="Docente"
                    select
                    required
                    value={pastMeetingForm.docenteEmail}
                    disabled={docenteOptions.length === 0}
                    helperText={
                      docenteOptions.length === 0
                        ? "No hay docentes/admin disponibles."
                        : undefined
                    }
                    onChange={(e) => {
                      const selectedEmail = e.target.value;
                      setPastMeetingForm((prev) => ({
                        ...prev,
                        docenteEmail: selectedEmail,
                        responsableEmail: prev.responsableEmail || selectedEmail
                      }));
                    }}
                  >
                    {docenteOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Responsable"
                    select
                    required
                    value={pastMeetingForm.responsableEmail}
                    disabled={docenteOptions.length === 0}
                    helperText={
                      docenteOptions.length === 0
                        ? "No hay docentes/admin disponibles."
                        : undefined
                    }
                    onChange={(e) =>
                      setPastMeetingForm((prev) => ({ ...prev, responsableEmail: e.target.value }))
                    }
                  >
                    {docenteOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Asistente Zoom"
                    select
                    required
                    value={pastMeetingForm.monitorEmail}
                    disabled={monitorOptions.length === 0}
                    helperText={
                      monitorOptions.length === 0
                        ? "No hay asistentes/admin disponibles."
                        : undefined
                    }
                    onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, monitorEmail: e.target.value }))}
                  >
                    {monitorOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  {!isZoomSeedMode ? (
                    <TextField
                      label="Zoom Meeting ID"
                      value={pastMeetingForm.zoomMeetingId}
                      onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, zoomMeetingId: e.target.value }))}
                    />
                  ) : null}
                  {!isZoomSeedMode ? (
                    <TextField
                      label="Inicio real"
                      type="datetime-local"
                      required
                      InputLabelProps={{ shrink: true }}
                      value={pastMeetingForm.inicioRealAt}
                      onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, inicioRealAt: e.target.value }))}
                    />
                  ) : null}
                  {!isZoomSeedMode ? (
                    <TextField
                      label="Fin real"
                      type="datetime-local"
                      required
                      InputLabelProps={{ shrink: true }}
                      value={pastMeetingForm.finRealAt}
                      onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, finRealAt: e.target.value }))}
                    />
                  ) : null}
                  {programaOptions.length > 0 ? (
                    <TextField
                      label="Programa"
                      select
                      required
                      value={pastMeetingForm.programaNombre}
                      onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, programaNombre: e.target.value }))}
                    >
                      {programaOptions.map((programa) => (
                        <MenuItem key={programa} value={programa}>
                          {programa}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField
                      label="Programa"
                      required
                      value={pastMeetingForm.programaNombre}
                      onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, programaNombre: e.target.value }))}
                    />
                  )}
                </Box>
                {!isZoomSeedMode ? (
                  <TextField
                    sx={{ mt: 1.5 }}
                    fullWidth
                    label="Link de Zoom (opcional)"
                    type="url"
                    value={pastMeetingForm.zoomJoinUrl}
                    onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, zoomJoinUrl: e.target.value }))}
                  />
                ) : null}
                {!isZoomSeedMode ? (
                  <TextField
                    sx={{ mt: 1.5 }}
                    fullWidth
                    multiline
                    minRows={3}
                    label="Descripcion (opcional)"
                    value={pastMeetingForm.descripcion}
                    onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  />
                ) : null}
                <Button sx={{ mt: 1.5 }} type="submit" variant="contained" disabled={isSubmittingPastMeeting}>
                  {isSubmittingPastMeeting ? "Registrando..." : "Registrar reunion pasada"}
                </Button>
              </Box>
            </Collapse>
          </Paper>
        </Stack>
      </CardContent>
    </Card>
  );
}
