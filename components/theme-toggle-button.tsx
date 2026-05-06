"use client";

import { IconButton, Tooltip } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import { useThemeMode } from "./mui-provider";

export function ThemeToggleButton() {
  const { mode, toggleMode } = useThemeMode();

  return (
    <Tooltip title={`Cambiar a modo ${mode === "light" ? "oscuro" : "claro"}`}>
      <IconButton
        onClick={toggleMode}
        color="inherit"
        sx={{
          bgcolor: "background.paper",
          boxShadow: 2,
          "&:hover": {
            bgcolor: "action.hover",
          },
        }}
      >
        {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
