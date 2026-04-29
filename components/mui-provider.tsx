"use client";

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

type ColorMode = "light" | "dark";

type ThemeModeContextValue = {
  mode: ColorMode;
  toggleMode: () => void;
};

const STORAGE_KEY = "flacso-theme-mode";

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: "light",
  toggleMode: () => {}
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

export function MuiProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>("light");

  useEffect(() => {
    const storedMode = window.localStorage.getItem(STORAGE_KEY);
    let initialMode: ColorMode = "light";

    if (storedMode === "light" || storedMode === "dark") {
      initialMode = storedMode;
    } else {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
      initialMode = prefersDark ? "dark" : "light";
    }

    setMode(initialMode);
    if (initialMode === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleMode = () => {
    setMode((currentMode) => {
      const nextMode: ColorMode = currentMode === "light" ? "dark" : "light";
      window.localStorage.setItem(STORAGE_KEY, nextMode);
      
      if (nextMode === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      
      return nextMode;
    });
  };

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: {
            main: mode === "dark" ? "#60a5fa" : "#1f4b8f",
            light: mode === "dark" ? "#93c5fd" : "#4f73ad",
            dark: mode === "dark" ? "#3b82f6" : "#16386b"
          },
          secondary: {
            main: mode === "dark" ? "#34d399" : "#2e7d32",
            light: mode === "dark" ? "#6ee7b7" : "#60ad5e",
            dark: mode === "dark" ? "#059669" : "#1b5e20"
          },
          background: {
            default: mode === "dark" ? "#020617" : "#f6f8fc",
            paper: mode === "dark" ? "#0f172a" : "#ffffff"
          },
          text: {
            primary: mode === "dark" ? "#f8fafc" : "#0f172a",
            secondary: mode === "dark" ? "#94a3b8" : "#475569",
            disabled: mode === "dark" ? "#64748b" : "#94a3b8"
          },
          divider: mode === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)",
          action: {
            hover: mode === "dark" ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.04)",
            selected: mode === "dark" ? "rgba(96, 165, 250, 0.12)" : "rgba(31, 75, 143, 0.08)",
            disabledBackground: mode === "dark" ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)"
          }
        },
        shape: {
          borderRadius: 12
        },
        typography: {
          fontFamily: "Roboto, 'Helvetica Neue', Arial, sans-serif"
        },
        components: {
          MuiCardContent: {
            styleOverrides: {
              root: {
                padding: 24,
                "&:last-child": {
                  paddingBottom: 24
                }
              }
            }
          },
          MuiDialogContent: {
            styleOverrides: {
              root: {
                padding: 24
              }
            }
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
                boxShadow: mode === "dark" ? "0 4px 20px 0 rgba(0,0,0,0.4)" : "0 4px 12px 0 rgba(0,0,0,0.05)"
              }
            }
          },
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 10
              }
            }
          }
        }
      }),
    [mode]
  );

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
