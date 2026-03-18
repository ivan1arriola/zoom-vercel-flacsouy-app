import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "FLACSO Uruguay | Plataforma Zoom",
  description: "Aplicacion modular con UI, base de datos e integraciones para FLACSO Uruguay"
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
              <h1>Plataforma de Gestion Zoom</h1>
              <p>Facultad Latinoamericana de Ciencias Sociales - Uruguay</p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              {session?.user ? (
                <>
                  <p className="muted" style={{ margin: 0 }}>
                    {session.user.email} ({session.user.role})
                  </p>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <button className="btn ghost" type="submit" style={{ marginTop: 8 }}>
                      Cerrar sesión
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="shell app-content">
          <nav className="nav">
            <Link href="/">Dashboard</Link>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
