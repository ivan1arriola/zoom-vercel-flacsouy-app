"use client";

import { Box } from "@mui/material";
import { type SxProps, type Theme } from "@mui/material/styles";

type FlacsoBrandLogoProps = {
  height?: number | string;
  alt?: string;
  sx?: SxProps<Theme>;
};

export function FlacsoBrandLogo({
  height,
  alt = "FLACSO Uruguay",
  sx
}: FlacsoBrandLogoProps) {
  const src = "/pwa-512x512.png";
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
