import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { UserAvatar } from "@/components/user-avatar";
import { AdminViewSwitcher } from "@/components/admin-view-switcher";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "FLACSO Uruguay | Plataforma Zoom",
  description: "Aplicacion modular con UI, base de datos e integraciones para FLACSO Uruguay",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    shortcut: "/favicon.svg",
    apple: "/icon.svg"
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
              <h1>Plataforma de Gestion Zoom</h1>
              <p>Facultad Latinoamericana de Ciencias Sociales - Uruguay</p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right", display: "grid", gap: 8, justifyItems: "end" }}>
              {session?.user ? (
                <>
                  {session.user.role === "ADMINISTRADOR" ? <AdminViewSwitcher /> : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <UserAvatar
                      firstName={session.user.firstName}
                      lastName={session.user.lastName}
                      image={session.user.image}
                      size={36}
                    />
                    <div>
                      <p className="muted" style={{ margin: 0, fontSize: "0.9em" }}>
                        {session.user.firstName && session.user.lastName
                          ? `${session.user.firstName} ${session.user.lastName}`
                          : session.user.email}
                      </p>
                      <p className="muted" style={{ margin: 0, fontSize: "0.8em" }}>
                        {session.user.role}
                      </p>
                    </div>
                  </div>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Link href="/?tab=perfil" className="btn ghost">
                        Mi perfil
                      </Link>
                      <button className="btn ghost" type="submit">
                        Cerrar sesión
                      </button>
                    </div>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <main className="shell app-content">{children}</main>
      </body>
    </html>
  );
}
