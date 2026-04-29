import type { Metadata, Viewport } from "next";
import { Box, Container } from "@mui/material";
import { auth } from "@/auth";
import { LayoutNavbar } from "@/components/layout-navbar";
import { MuiProvider } from "@/components/mui-provider";
import { PwaRegister } from "@/components/pwa-register";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  applicationName: "Plataforma Zoom de FLACSO Uruguay",
  title: "Plataforma Zoom de FLACSO Uruguay",
  description: "Aplicacion modular con UI, base de datos e integraciones para FLACSO Uruguay",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Plataforma Zoom de FLACSO Uruguay"
  },
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico"
  },
  other: {
    "mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f4b8f",
  viewportFit: "cover"
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="es">
      <body>
        <MuiProvider>
          <PwaRegister />
          <Box sx={{ display: "flex", minHeight: "100vh", backgroundColor: "background.default" }}>
            {session?.user ? <LayoutNavbar user={session.user} /> : null}

            <Box
              component="main"
              sx={{
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                pt: { xs: 8, md: 0 },
                backgroundColor: "background.default"
              }}
            >
              <Box sx={{ height: 4, background: "linear-gradient(90deg, #1f4b8f, #f9b503)", opacity: 0.8 }} />
              <Container
                maxWidth="xl"
                sx={{
                  py: { xs: 3, md: 6 },
                  px: { xs: 2, sm: 4, md: 6 },
                  flexGrow: 1
                }}
              >
                {children}
              </Container>
            </Box>
          </Box>
        </MuiProvider>
      </body>
    </html>
  );
}
