"use client";

import { Box } from "@mui/material";
import { type SxProps, type Theme, useTheme } from "@mui/material/styles";

type FlacsoBrandLogoProps = {
  height?: number | string;
  alt?: string;
  color?: "primary" | "secondary";
  contrast?: "auto" | "light" | "dark";
  sx?: SxProps<Theme>;
};

export function FlacsoBrandLogo({
  height,
  alt = "FLACSO Uruguay",
  color = "primary",
  contrast = "auto",
  sx
}: FlacsoBrandLogoProps) {
  const theme = useTheme();
  const resolvedContrast = contrast === "auto" ? (theme.palette.mode === "dark" ? "light" : "dark") : contrast;
  const colorSuffix = resolvedContrast === "light" ? "white" : color === "primary" ? "blue" : "blue";
  const src = `/branding/flacso-uruguay-${color}-${colorSuffix}.png`;
  const resolvedHeight = height ?? 36;

  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={{
        display: "block",
        height: resolvedHeight,
        width: "auto",
        maxWidth: "100%",
        objectFit: "contain",
        ...sx
      }}
    />
  );
}
