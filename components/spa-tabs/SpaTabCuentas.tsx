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
import { MeetingAssistantStatusChip } from "@/components/spa-tabs/MeetingAssistantStatusChip";
import { ZoomAccountPasswordField } from "@/components/spa-tabs/ZoomAccountPasswordField";

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
  const totalPendingEvents = useMemo(
    () => zoomAccounts.reduce((total, account) => total + account.pendingEventsCount, 0),
    [zoomAccounts]
  );
  const accountsWithPendingEvents = useMemo(
    () => zoomAccounts.filter((account) => account.pendingEventsCount > 0).length,
    [zoomAccounts]
  );
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
          direction={{ xs: "column", lg: "row" }}
          spacing={1.5}
          alignItems={{ xs: "flex-start", lg: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Cuentas Zoom disponibles
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
              Gestiona cuentas del grupo, pendientes y detalle por evento.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`${zoomAccounts.length} cuenta(s)`} />
            <Chip
              size="small"
              variant="outlined"
              color={totalPendingEvents > 0 ? "warning" : "default"}
              label={`${totalPendingEvents} pendiente(s)`}
            />
            <Button variant="outlined" onClick={onRefresh} disabled={isLoadingZoomAccounts}>
              {isLoadingZoomAccounts ? "Actualizando..." : "Actualizar"}
            </Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          <Chip size="small" variant="outlined" label={`Grupo: ${zoomGroupName || "(sin nombre)"}`} />
          <Chip
            size="small"
            variant="outlined"
            color={accountsWithPendingEvents > 0 ? "warning" : "default"}
            label={`${accountsWithPendingEvents} con pendientes`}
          />
        </Stack>

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
                    borderLeft: `5px solid ${accountColor.border}`,
                    backgroundColor: "background.paper",
                    transition: "box-shadow 160ms ease, border-color 160ms ease",
                    "&:hover": {
                      boxShadow: 2
                    }
                  }}
                >
                  <Box sx={{ p: { xs: 1.2, md: 1.6 } }}>
                    <Stack
                      direction={{ xs: "column", md: "row" }}
                      spacing={1.2}
                      alignItems={{ xs: "flex-start", md: "flex-start" }}
                      justifyContent="space-between"
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                          Cuenta Zoom
                        </Typography>
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
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {accountName}
                          </Typography>
                          {isLicensedZoomAccount(account) ? <Chip size="small" color="success" label="Licencia" /> : null}
                          {account.overlapCount > 0 ? (
                            <Chip size="small" color="warning" label={`Choques: ${account.overlapCount}`} />
                          ) : null}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Chip
                          size="small"
                          variant={account.pendingEventsCount > 0 ? "filled" : "outlined"}
                          color={account.pendingEventsCount > 0 ? "warning" : "default"}
                          label={`${account.pendingEventsCount} pendientes`}
                        />
                        {recurringSeriesCountByMeetingId.size > 0 ? (
                          <Chip
                            size="small"
                            variant="outlined"
                            color="primary"
                            label={`${recurringSeriesCountByMeetingId.size} recurrente(s)`}
                          />
                        ) : null}
                        {account.pendingEventsCount > 0 ? (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ minWidth: 118 }}
                            onClick={() => setExpandedZoomAccountId(isExpanded ? null : account.id)}
                          >
                            {isExpanded ? "Ocultar detalle" : "Ver detalle"}
                          </Button>
                        ) : null}
                      </Stack>
                    </Stack>
                    <Box
                      sx={{
                        mt: 1.1,
                        px: 1.2,
                        py: 0.9,
                        borderRadius: 1.5,
                        border: "1px dashed",
                        borderColor: "divider",
                        backgroundColor: "grey.50"
                      }}
                    >
                      <ZoomAccountPasswordField
                        hostAccount={account.email}
                        label="Contrasena cuenta streaming"
                      />
                    </Box>

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
                                    borderLeft: hasOverlap
                                      ? "4px solid"
                                      : startsSoon
                                        ? "4px solid"
                                        : "1px solid",
                                    borderLeftColor: hasOverlap
                                      ? "error.main"
                                      : startsSoon
                                        ? "warning.main"
                                        : "divider",
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
                                        <Chip
                                          size="small"
                                          variant="outlined"
                                          label={`ID ${event.meetingId || "-"}`}
                                        />
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
                                  <Box
                                    sx={{
                                      mt: 1,
                                      display: "grid",
                                      gridTemplateColumns: {
                                        xs: "1fr",
                                        md: "repeat(3, minmax(0, 1fr))"
                                      },
                                      gap: 1
                                    }}
                                  >
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">
                                        ID de reunion
                                      </Typography>
                                      <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                                        {event.meetingId || "-"}
                                      </Typography>
                                    </Box>
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">
                                        Cantidad de reuniones
                                      </Typography>
                                      <Typography variant="body2">
                                        {recurringSeriesInstances > 0 ? recurringSeriesInstances : 1}{" "}
                                        {(recurringSeriesInstances > 0 ? recurringSeriesInstances : 1) === 1
                                          ? "instancia"
                                          : "instancias"}
                                      </Typography>
                                    </Box>
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">
                                        Asistente por reunion
                                      </Typography>
                                      <MeetingAssistantStatusChip
                                        requiresAssistance
                                        pendingLabel="Pendiente de asociacion"
                                      />
                                    </Box>
                                  </Box>
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
