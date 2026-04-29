"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Stack, Typography } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { loadZoomAccountPassword } from "@/src/services/tarifasApi";

const MASKED_PASSWORD = "********";

interface ZoomAccountPasswordFieldProps {
  hostAccount?: string | null;
  label?: string;
  size?: "small" | "medium";
  sx?: SxProps<Theme>;
}

export function ZoomAccountPasswordField({
  hostAccount,
  label = "Contrasena de la cuenta",
  size = "small",
  sx
}: ZoomAccountPasswordFieldProps) {
  const normalizedHostAccount = useMemo(() => (hostAccount ?? "").trim(), [hostAccount]);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    setIsVisible(false);
    setIsLoading(false);
    setPassword(null);
    setError("");
    setHasFetched(false);
  }, [normalizedHostAccount]);

  async function handleToggleVisibility() {
    if (!normalizedHostAccount) return;

    if (isVisible) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);
    if (isLoading || (hasFetched && password)) return;

    setIsLoading(true);
    setError("");
    const payload = await loadZoomAccountPassword(normalizedHostAccount);
    setHasFetched(true);

    if (payload.success && payload.password) {
      setPassword(payload.password);
      setError("");
    } else {
      setPassword(null);
      const rawError = payload.error || "";
      if (rawError.includes("Forbidden") || rawError.includes("forbidden")) {
        setError("Sin permiso para ver");
      } else {
        setError(rawError || "No disponible");
      }
    }
    setIsLoading(false);
  }

  const displayValue = !normalizedHostAccount
    ? "No disponible"
    : !isVisible
      ? MASKED_PASSWORD
      : isLoading
        ? "Consultando..."
        : password || error || "No disponible";

  return (
    <Stack spacing={0.35} sx={sx}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={0.8} alignItems="center" useFlexGap flexWrap="wrap">
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            color: isVisible && error && !isLoading && !password ? "error.main" : "text.primary"
          }}
        >
          {displayValue}
        </Typography>
        {normalizedHostAccount ? (
          <Button
            size={size}
            variant={isVisible ? "contained" : "outlined"}
            color="warning"
            onClick={() => {
              void handleToggleVisibility();
            }}
            disabled={isLoading}
            startIcon={isVisible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
          >
            {isLoading ? "Consultando..." : isVisible ? "Ocultar" : "Ver clave"}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}
