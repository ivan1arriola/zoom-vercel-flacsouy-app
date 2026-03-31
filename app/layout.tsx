import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Box, Container, Stack, Typography } from "@mui/material";
import { auth } from "@/auth";
import { MuiProvider } from "@/components/mui-provider";
import { UserMenu } from "@/components/user-menu";
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
  applicationName: "FLACSO Zoom Salas",
  title: "FLACSO Uruguay | Plataforma Zoom",
  description: "Aplicacion modular con UI, base de datos e integraciones para FLACSO Uruguay",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FLACSO Zoom"
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
          <Box sx={{ height: 6, background: "linear-gradient(90deg, #1f4b8f, #f9b503)" }} />

          <Box
            component="header"
            sx={{
              backgroundColor: "background.paper",
              borderBottom: 1,
              borderColor: "divider",
              boxShadow: "0 8px 24px rgba(15, 26, 45, 0.06)"
            }}
          >
            <Container maxWidth="lg" sx={{ py: 1.2 }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={{ xs: 1.2, md: 2 }}
                alignItems={{ xs: "stretch", md: "center" }}
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
                  <Link href="/" style={{ display: "inline-flex" }}>
                    <Box
                      component="img"
                      src="/flacso-logo.png"
                      alt="FLACSO Uruguay"
                      sx={{ width: "188px", maxWidth: "42vw", height: "auto", display: "block" }}
                    />
                  </Link>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: "primary.main" }}>
                      Herramienta para coordinar Zoom
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Facultad Latinoamericana de Ciencias Sociales - Uruguay
                    </Typography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    ml: { md: "auto" },
                    flexShrink: 0,
                    width: { xs: "100%", md: "auto" },
                    display: "flex",
                    justifyContent: { xs: "flex-end", md: "flex-end" }
                  }}
                >
                  {session?.user ? (
                    <UserMenu
                      firstName={session.user.firstName}
                      lastName={session.user.lastName}
                      email={session.user.email}
                      image={session.user.image}
                      role={session.user.role}
                    />
                  ) : null}
                </Box>
              </Stack>
            </Container>
          </Box>

          <Container maxWidth="lg" component="main" sx={{ py: 2.5 }}>
            {children}
          </Container>
        </MuiProvider>
      </body>
    </html>
  );
}
