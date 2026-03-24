"use client";

import { Fragment } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Paper
} from "@mui/material";
import {
  isLicensedZoomAccount,
  isMeetingStartingSoon,
  formatZoomDateTime,
  formatDurationHoursMinutes
} from "./spa-tabs-utils";
import type { ZoomAccount } from "@/src/services/zoomApi";

interface SpaTabCuentasProps {
  zoomAccounts: ZoomAccount[];
  zoomGroupName: string;
  isLoadingZoomAccounts: boolean;
  expandedZoomAccountId: string | null;
  setExpandedZoomAccountId: (id: string | null) => void;
  onRefresh: () => void;
}

export function SpaTabCuentas({
  zoomAccounts,
  zoomGroupName,
  isLoadingZoomAccounts,
  expandedZoomAccountId,
  setExpandedZoomAccountId,
  onRefresh
}: SpaTabCuentasProps) {
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
            Cuentas Zoom disponibles
          </Typography>
          <Button variant="outlined" onClick={onRefresh} disabled={isLoadingZoomAccounts}>
            {isLoadingZoomAccounts ? "Actualizando..." : "Actualizar"}
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Grupo: {zoomGroupName || "(sin nombre)"}
        </Typography>

        {isLoadingZoomAccounts ? (
          <Typography variant="body2" color="text.secondary">
            Cargando cuentas...
          </Typography>
        ) : zoomAccounts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay cuentas disponibles en el grupo.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Eventos pendientes (Zoom)</TableCell>
                  <TableCell>Detalle</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {zoomAccounts.map((account) => (
                  <Fragment key={account.id}>
                    <TableRow hover>
                      <TableCell>{account.email || "-"}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography component="span" variant="body2">
                            {[account.firstName, account.lastName].filter(Boolean).join(" ") || "-"}
                          </Typography>
                          {isLicensedZoomAccount(account) ? <Chip size="small" color="success" label="Licencia" /> : null}
                        </Stack>
                      </TableCell>
                      <TableCell>{account.pendingEventsCount}</TableCell>
                      <TableCell>
                        {account.pendingEventsCount > 0 ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              setExpandedZoomAccountId(expandedZoomAccountId === account.id ? null : account.id)
                            }
                          >
                            {expandedZoomAccountId === account.id ? "Ocultar detalle" : "Ver detalle"}
                          </Button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={4} sx={{ py: 0, borderBottom: expandedZoomAccountId === account.id ? undefined : 0 }}>
                        <Collapse in={expandedZoomAccountId === account.id} timeout="auto" unmountOnExit>
                          <Box sx={{ py: 1.5 }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>#</TableCell>
                                  <TableCell>Tema</TableCell>
                                  <TableCell>Inicio</TableCell>
                                  <TableCell>Duracion</TableCell>
                                  <TableCell>Link</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {account.pendingEvents.map((event, index) => (
                                  <TableRow
                                    key={event.id}
                                    hover
                                    sx={isMeetingStartingSoon(event.startTime) ? { backgroundColor: "warning.50" } : undefined}
                                  >
                                    <TableCell sx={{ fontFamily: "monospace" }}>#{index + 1}</TableCell>
                                    <TableCell>{event.topic}</TableCell>
                                    <TableCell>{formatZoomDateTime(event.startTime)}</TableCell>
                                    <TableCell>{formatDurationHoursMinutes(event.durationMinutes)}</TableCell>
                                    <TableCell>
                                      {event.joinUrl ? (
                                        <Button size="small" variant="contained" color="secondary" href={event.joinUrl} target="_blank" rel="noreferrer">
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
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
