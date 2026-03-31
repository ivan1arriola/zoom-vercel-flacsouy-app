"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";

type ManualPending = {
  id: string;
  titulo: string;
};

type ManualAccountOption = {
  id: string;
  label: string;
};

export type ManualResolutionInput = {
  solicitudId: string;
  cuentaZoomAsignadaId: string;
  zoomMeetingIdManual: string;
  zoomJoinUrlManual?: string;
  observaciones?: string;
};

interface SpaTabManualProps {
  manualPendings: ManualPending[];
  accountOptions: ManualAccountOption[];
  isLoadingAccounts: boolean;
  resolvingSolicitudId: string | null;
  onRefresh: () => void;
  onResolve: (input: ManualResolutionInput) => void | Promise<void>;
}

type ManualFormState = {
  cuentaZoomAsignadaId: string;
  zoomMeetingIdManual: string;
  zoomJoinUrlManual: string;
  observaciones: string;
};

export function SpaTabManual({
  manualPendings,
  accountOptions,
  isLoadingAccounts,
  resolvingSolicitudId,
  onRefresh,
  onResolve
}: SpaTabManualProps) {
  const [formBySolicitudId, setFormBySolicitudId] = useState<Record<string, ManualFormState>>({});

  const defaultAccountId = useMemo(() => accountOptions[0]?.id ?? "", [accountOptions]);

  useEffect(() => {
    setFormBySolicitudId((prev) => {
      const next: Record<string, ManualFormState> = {};
      for (const pending of manualPendings) {
        const existing = prev[pending.id];
        next[pending.id] = existing ?? {
          cuentaZoomAsignadaId: defaultAccountId,
          zoomMeetingIdManual: "",
          zoomJoinUrlManual: "",
          observaciones: ""
        };
      }
      return next;
    });
  }, [manualPendings, defaultAccountId]);

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
            Pendientes de resolucion manual
          </Typography>
          <Button variant="outlined" onClick={onRefresh} disabled={Boolean(resolvingSolicitudId)}>
            Actualizar
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.6 }}>
          Resuelve cada solicitud manualmente asignando cuenta Zoom y Meeting ID.
        </Typography>

        {isLoadingAccounts ? (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            Cargando cuentas Zoom...
          </Alert>
        ) : null}

        {!isLoadingAccounts && accountOptions.length === 0 ? (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            No hay cuentas Zoom disponibles para resolver pendientes.
          </Alert>
        ) : null}

        {manualPendings.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay pendientes manuales.
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {manualPendings.map((item) => {
              const formState = formBySolicitudId[item.id] ?? {
                cuentaZoomAsignadaId: defaultAccountId,
                zoomMeetingIdManual: "",
                zoomJoinUrlManual: "",
                observaciones: ""
              };
              const isResolving = resolvingSolicitudId === item.id;
              const canSubmit =
                Boolean(formState.cuentaZoomAsignadaId) &&
                formState.zoomMeetingIdManual.trim().length > 0 &&
                !isResolving &&
                accountOptions.length > 0;

              return (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {item.titulo}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.2, fontFamily: "monospace" }}>
                    {item.id}
                  </Typography>

                  <Stack spacing={1}>
                    <TextField
                      select
                      size="small"
                      label="Cuenta Zoom"
                      value={formState.cuentaZoomAsignadaId}
                      onChange={(event) => {
                        const value = String(event.target.value);
                        setFormBySolicitudId((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...formState,
                            cuentaZoomAsignadaId: value
                          }
                        }));
                      }}
                      disabled={isResolving || isLoadingAccounts || accountOptions.length === 0}
                    >
                      {accountOptions.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.label}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        gap: 1
                      }}
                    >
                      <TextField
                        size="small"
                        label="Meeting ID (manual)"
                        value={formState.zoomMeetingIdManual}
                        onChange={(event) => {
                          const value = event.target.value;
                          setFormBySolicitudId((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...formState,
                              zoomMeetingIdManual: value
                            }
                          }));
                        }}
                        disabled={isResolving}
                      />
                      <TextField
                        size="small"
                        label="Join URL (opcional)"
                        value={formState.zoomJoinUrlManual}
                        onChange={(event) => {
                          const value = event.target.value;
                          setFormBySolicitudId((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...formState,
                              zoomJoinUrlManual: value
                            }
                          }));
                        }}
                        disabled={isResolving}
                      />
                    </Box>

                    <TextField
                      size="small"
                      label="Observaciones (opcional)"
                      value={formState.observaciones}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFormBySolicitudId((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...formState,
                            observaciones: value
                          }
                        }));
                      }}
                      disabled={isResolving}
                    />

                    <Stack direction="row" justifyContent="flex-end">
                      <Button
                        variant="contained"
                        color="primary"
                        disabled={!canSubmit}
                        onClick={() =>
                          void onResolve({
                            solicitudId: item.id,
                            cuentaZoomAsignadaId: formState.cuentaZoomAsignadaId.trim(),
                            zoomMeetingIdManual: formState.zoomMeetingIdManual.trim(),
                            zoomJoinUrlManual: formState.zoomJoinUrlManual.trim() || undefined,
                            observaciones: formState.observaciones.trim() || undefined
                          })
                        }
                      >
                        {isResolving ? "Resolviendo..." : "Resolver pendiente"}
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
