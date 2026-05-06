import Link from "next/link";

export const metadata = {
  title: "FLACSO Uruguay Zoom APP | Pagina publica",
  description:
    "Pagina publica de FLACSO Uruguay Zoom APP con descripcion funcional, uso de datos de Google y enlaces legales."
};

export default function OAuthHomePage() {
  return (
    <main
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "40px 20px 56px",
        lineHeight: 1.65,
        color: "#0f172a"
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <img
          src="/branding/flacso-uruguay-primary-blue.png"
          alt="FLACSO Uruguay"
          style={{ maxWidth: 300, width: "100%", height: "auto", display: "block", marginBottom: 20 }}
        />
        <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.2 }}>FLACSO Uruguay Zoom APP</h1>
        <p style={{ marginTop: 12, fontSize: "1.05rem" }}>
          Plataforma institucional para gestionar reuniones academicas en Zoom, asistentes, notificaciones y
          sincronizacion con Google Calendar.
        </p>
      </header>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 8 }}>Que hace la aplicacion</h2>
        <ul style={{ marginTop: 0, paddingLeft: 20 }}>
          <li>Gestion de reuniones y solicitudes de salas Zoom.</li>
          <li>Coordinacion de asistentes de soporte para eventos.</li>
          <li>Registro operativo de actividad y notificaciones internas.</li>
          <li>Sincronizacion automatica de reuniones con Google Calendar segun permisos otorgados.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 8 }}>Uso de datos de Google</h2>
        <p style={{ marginTop: 0 }}>
          Solicitamos el acceso minimo necesario a datos de Google para autenticar usuarios y operar funciones
          calendarizadas. En particular: perfil basico, correo electronico y permisos de calendario asociados al uso de
          reuniones.
        </p>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 8 }}>Enlaces legales</h2>
        <ul style={{ marginTop: 0, paddingLeft: 20 }}>
          <li>
            <Link href="/privacy">Politica de Privacidad</Link>
          </li>
          <li>
            <Link href="/terms">Terminos del Servicio</Link>
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ marginBottom: 8 }}>Contacto</h2>
        <p style={{ marginTop: 0 }}>
          Para consultas sobre autenticacion, uso de datos o soporte de la app: <strong>web@flacso.edu.uy</strong>.
        </p>
      </section>

      <p style={{ marginTop: 28 }}>
        <Link href="/">Ir al acceso de la aplicacion</Link>
      </p>
    </main>
  );
}
