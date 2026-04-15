"use client";

import { Box } from "@mui/material";
import { useTheme, type SxProps, type Theme } from "@mui/material/styles";

type FlacsoBrandVariant = "primary" | "secondary";
type BackgroundTone = "auto" | "light" | "dark";
type LightBackgroundVariant = "blue" | "black";

type FlacsoBrandLogoProps = {
  variant?: FlacsoBrandVariant;
  backgroundTone?: BackgroundTone;
  lightBackgroundVariant?: LightBackgroundVariant;
  height?: number | string;
  alt?: string;
  sx?: SxProps<Theme>;
};

function resolveLogoTone(theme: Theme, backgroundTone: BackgroundTone): "light" | "dark" {
  if (backgroundTone === "light" || backgroundTone === "dark") return backgroundTone;
  return theme.palette.mode === "dark" ? "dark" : "light";
}

export function FlacsoBrandLogo({
  variant = "primary",
  backgroundTone = "auto",
  lightBackgroundVariant = "blue",
  height,
  alt = "FLACSO Uruguay",
  sx
}: FlacsoBrandLogoProps) {
  const theme = useTheme();
  const resolvedTone = resolveLogoTone(theme, backgroundTone);

  const assetVariant =
    resolvedTone === "dark"
      ? "white"
      : lightBackgroundVariant;

  const src = `/branding/flacso-uruguay-${variant}-${assetVariant}.png`;
  const resolvedHeight = height ?? (variant === "primary" ? 40 : 24);

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
