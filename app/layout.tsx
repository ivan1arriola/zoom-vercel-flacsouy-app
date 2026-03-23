import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { UserMenu } from "@/components/user-menu";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "FLACSO Uruguay | Plataforma Zoom",
  description: "Aplicacion modular con UI, base de datos e integraciones para FLACSO Uruguay",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: "/favicon.ico"
  }
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="es">
      <body>
        <PwaRegister />
        <div className="brand-strip" />
        <header className="brand-header">
          <div className="shell brand-inner">
            <Link href="/" className="brand-logo-link">
              <img
                className="brand-logo"
                src="/flacso-logo.png"
                alt="FLACSO Uruguay"
              />
            </Link>
            <div className="brand-copy">
              <h1>Herramienta para coordinar Zoom</h1>
              <p>Facultad Latinoamericana de Ciencias Sociales - Uruguay</p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right", display: "grid", gap: 8, justifyItems: "end" }}>
              {session?.user ? (
                <UserMenu
                  firstName={session.user.firstName}
                  lastName={session.user.lastName}
                  email={session.user.email}
                  image={session.user.image}
                  role={session.user.role}
                />
              ) : null}
            </div>
          </div>
        </header>

        <main className="shell app-content">{children}</main>
      </body>
    </html>
  );
}
