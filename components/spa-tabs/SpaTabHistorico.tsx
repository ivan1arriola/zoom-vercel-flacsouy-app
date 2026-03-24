"use client";

import { FormEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper
} from "@mui/material";
import { formatDateTime } from "@/src/lib/spa-home/recurrence";
import type { PastMeeting } from "@/src/services/solicitudesApi";

interface PastMeetingForm {
  titulo: string;
  modalidadReunion: string;
  docenteEmail: string;
  monitorEmail: string;
  zoomMeetingId: string;
  inicioRealAt: string;
  finRealAt: string;
  programaNombre: string;
  responsableNombre: string;
  zoomJoinUrl: string;
  descripcion: string;
}

interface SpaTabHistoricoProps {
  pastMeetings: PastMeeting[];
  isLoadingPastMeetings: boolean;
  onRefreshPastMeetings: () => void;
  pastMeetingForm: PastMeetingForm;
  setPastMeetingForm: (form: PastMeetingForm | ((prev: PastMeetingForm) => PastMeetingForm)) => void;
  isSubmittingPastMeeting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SpaTabHistorico({
  pastMeetings,
  isLoadingPastMeetings,
  onRefreshPastMeetings,
  pastMeetingForm,
  setPastMeetingForm,
  isSubmittingPastMeeting,
  onSubmit
}: SpaTabHistoricoProps) {
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

        {isLoadingPastMeetings ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cargando reuniones pasadas...
          </Typography>
        ) : pastMeetings.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            No hay reuniones pasadas registradas.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 2.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Titulo</TableCell>
                  <TableCell>ID Zoom</TableCell>
                  <TableCell>Docente</TableCell>
                  <TableCell>Monitoreo</TableCell>
                  <TableCell>Inicio</TableCell>
                  <TableCell>Fin</TableCell>
                  <TableCell>Duracion</TableCell>
                  <TableCell>Modalidad</TableCell>
                  <TableCell>Link</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pastMeetings.map((meeting) => (
                  <TableRow key={meeting.id} hover>
                    <TableCell>{meeting.titulo}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{meeting.zoomMeetingId}</TableCell>
                    <TableCell>{meeting.docenteNombre || meeting.docenteEmail}</TableCell>
                    <TableCell>{meeting.monitorNombre || meeting.monitorEmail || "-"}</TableCell>
                    <TableCell>{formatDateTime(meeting.inicioAt)}</TableCell>
                    <TableCell>{formatDateTime(meeting.finAt)}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{meeting.minutosReales} min</TableCell>
                    <TableCell>{meeting.modalidadReunion}</TableCell>
                    <TableCell>
                      {meeting.zoomJoinUrl ? (
                        <Button size="small" variant="contained" color="secondary" href={meeting.zoomJoinUrl} target="_blank" rel="noreferrer">
                          Abrir
                        </Button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          Registrar reunion pasada
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Este registro exige un Meeting ID de Zoom con instancias ya pasadas y crea la solicitud base para liquidacion.
        </Typography>
        <Box component="form" onSubmit={onSubmit}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 1.5
            }}
          >
            <TextField
              label="Titulo"
              required
              value={pastMeetingForm.titulo}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, titulo: e.target.value }))}
            />
            <TextField
              label="Modalidad"
              select
              value={pastMeetingForm.modalidadReunion}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, modalidadReunion: e.target.value }))}
            >
              <MenuItem value="VIRTUAL">Virtual</MenuItem>
              <MenuItem value="HIBRIDA">Hibrida</MenuItem>
            </TextField>
            <TextField
              label="Email docente"
              type="email"
              required
              value={pastMeetingForm.docenteEmail}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, docenteEmail: e.target.value }))}
            />
            <TextField
              label="Email monitoreo (opcional)"
              type="email"
              value={pastMeetingForm.monitorEmail}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, monitorEmail: e.target.value }))}
            />
            <TextField
              label="Zoom Meeting ID"
              value={pastMeetingForm.zoomMeetingId}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, zoomMeetingId: e.target.value }))}
            />
            <TextField
              label="Inicio real"
              type="datetime-local"
              required
              InputLabelProps={{ shrink: true }}
              value={pastMeetingForm.inicioRealAt}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, inicioRealAt: e.target.value }))}
            />
            <TextField
              label="Fin real"
              type="datetime-local"
              required
              InputLabelProps={{ shrink: true }}
              value={pastMeetingForm.finRealAt}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, finRealAt: e.target.value }))}
            />
            <TextField
              label="Programa (opcional)"
              value={pastMeetingForm.programaNombre}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, programaNombre: e.target.value }))}
            />
            <TextField
              label="Responsable (opcional)"
              value={pastMeetingForm.responsableNombre}
              onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, responsableNombre: e.target.value }))}
            />
          </Box>
          <TextField
            sx={{ mt: 1.5 }}
            fullWidth
            label="Link de Zoom (opcional)"
            type="url"
            value={pastMeetingForm.zoomJoinUrl}
            onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, zoomJoinUrl: e.target.value }))}
          />
          <TextField
            sx={{ mt: 1.5 }}
            fullWidth
            multiline
            minRows={3}
            label="Descripcion (opcional)"
            value={pastMeetingForm.descripcion}
            onChange={(e) => setPastMeetingForm((prev) => ({ ...prev, descripcion: e.target.value }))}
          />
          <Button sx={{ mt: 1.5 }} type="submit" variant="contained" disabled={isSubmittingPastMeeting}>
            {isSubmittingPastMeeting ? "Registrando..." : "Registrar reunion pasada"}
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
