"use client";

import { ReactNode, useMemo } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";

export function MuiProvider({ children }: { children: ReactNode }) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "light",
          primary: {
            main: "#1f4b8f"
          },
          secondary: {
            main: "#2e7d32"
          },
          error: {
            main: "#b3261e"
          },
          background: {
            default: "#f6f8fc",
            paper: "#ffffff"
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
                padding: 20,
                "&:last-child": {
                  paddingBottom: 20
                }
              }
            }
          },
          MuiDialogContent: {
            styleOverrides: {
              root: {
                padding: 20
              }
            }
          }
        }
      }),
    []
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
