"use client";

import { useMemo } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import {
  isLicensedZoomAccount,
  isMeetingStartingSoon,
  formatZoomDateTime,
  formatDurationHoursMinutes,
  getZoomAccountColor,
  buildZoomAccountColorMap
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
  const accountColorMap = useMemo(
    () =>
      buildZoomAccountColorMap(
        zoomAccounts.map((account) => `${account.id}:${account.email}`)
      ),
    [zoomAccounts]
  );

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
          <Stack spacing={1.2}>
            {zoomAccounts.map((account) => {
              const accountKey = `${account.id}:${account.email}`.trim().toLowerCase();
              const accountColor =
                accountColorMap.get(accountKey) ?? getZoomAccountColor(accountKey);
              const isExpanded = expandedZoomAccountId === account.id;
              const accountName = [account.firstName, account.lastName].filter(Boolean).join(" ") || "-";
              const recurringSeriesCountByMeetingId = account.pendingEvents.reduce((acc, event) => {
                if (event.meetingKind === "RECURRENTE" && event.meetingId) {
                  acc.set(event.meetingId, (acc.get(event.meetingId) ?? 0) + 1);
                }
                return acc;
              }, new Map<string, number>());

              return (
                <Paper
                  key={account.id}
                  variant="outlined"
                  sx={{
                    borderRadius: 2,
                    overflow: "hidden",
                    borderLeft: `5px solid ${accountColor.border}`
                  }}
                >
                  <Box sx={{ p: 1.5 }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1}
                      alignItems={{ xs: "flex-start", md: "center" }}
                      justifyContent="space-between"
                    >
                      <Box>
                        <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" alignItems="center">
                          <Chip
                            size="small"
                            label={account.email || "-"}
                            sx={{
                              bgcolor: accountColor.background,
                              color: accountColor.text,
                              border: `1px solid ${accountColor.border}`,
                              fontWeight: 700
                            }}
                          />
                          <Typography variant="subtitle2">{accountName}</Typography>
                          {isLicensedZoomAccount(account) ? <Chip size="small" color="success" label="Licencia" /> : null}
                          {account.overlapCount > 0 ? (
                            <Chip size="small" color="warning" label={`Choques: ${account.overlapCount}`} />
                          ) : null}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" variant="outlined" label={`${account.pendingEventsCount} pendientes`} />
                        {recurringSeriesCountByMeetingId.size > 0 ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            color="primary"
                            label={`${recurringSeriesCountByMeetingId.size} serie(s) recurrente(s)`}
                          />
                        ) : null}
                        {account.pendingEventsCount > 0 ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setExpandedZoomAccountId(isExpanded ? null : account.id)}
                          >
                            {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>

                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ mt: 1.2 }}>
                        {account.overlapCount > 0 ? (
                          <Alert severity="warning" sx={{ mb: 1.2 }}>
                            Zoom reporta {account.overlapCount} solapamiento(s) en esta cuenta.
                          </Alert>
                        ) : null}
                        {account.pendingEvents.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No hay eventos pendientes en esta cuenta.
                          </Typography>
                        ) : (
                          <Stack spacing={1}>
                            {account.pendingEvents.map((event) => {
                              const hasOverlap = account.overlappingEventIds.includes(event.id);
                              const startsSoon = isMeetingStartingSoon(event.startTime);
                              const recurringSeriesId =
                                event.meetingKind === "RECURRENTE" ? event.meetingId : null;
                              const recurringSeriesInstances = recurringSeriesId
                                ? recurringSeriesCountByMeetingId.get(recurringSeriesId) ?? 0
                                : 0;
                              const recurringSeriesColor = recurringSeriesId
                                ? getZoomAccountColor(`series:${recurringSeriesId}`)
                                : null;

                              return (
                                <Paper
                                  key={event.id}
                                  variant="outlined"
                                  sx={{
                                    p: 1.2,
                                    borderRadius: 1.5,
                                    backgroundColor: hasOverlap
                                      ? "error.50"
                                      : startsSoon
                                        ? "warning.50"
                                        : undefined
                                  }}
                                >
                                  <Stack
                                    direction={{ xs: "column", md: "row" }}
                                    spacing={1}
                                    alignItems={{ xs: "flex-start", md: "center" }}
                                    justifyContent="space-between"
                                  >
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {event.topic}
                                      </Typography>
                                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                                        <Chip size="small" variant="outlined" label={formatZoomDateTime(event.startTime)} />
                                        <Chip size="small" variant="outlined" label={formatDurationHoursMinutes(event.durationMinutes)} />
                                        {recurringSeriesId ? (
                                          <Chip
                                            size="small"
                                            label={
                                              recurringSeriesInstances > 1
                                                ? `Serie recurrente ${recurringSeriesId}`
                                                : "Recurrente"
                                            }
                                            sx={{
                                              bgcolor: recurringSeriesColor?.background,
                                              color: recurringSeriesColor?.text,
                                              border: `1px solid ${recurringSeriesColor?.border ?? "transparent"}`
                                            }}
                                          />
                                        ) : null}
                                        {hasOverlap ? <Chip size="small" color="error" label="Se pisa" /> : null}
                                      </Stack>
                                    </Box>
                                    {event.joinUrl ? (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        color="secondary"
                                        href={event.joinUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Abrir
                                      </Button>
                                    ) : null}
                                  </Stack>
                                </Paper>
                              );
                            })}
                          </Stack>
                        )}
                      </Box>
                    </Collapse>
                  </Box>
                </Paper>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
