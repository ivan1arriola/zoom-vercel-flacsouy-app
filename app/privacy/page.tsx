import Link from "next/link";

export const metadata = {
  title: "Politica de Privacidad | FLACSO Zoom Uruguay"
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px", lineHeight: 1.6 }}>
      <h1>Politica de Privacidad</h1>
      <p>
        Ultima actualizacion: 5 de mayo de 2026.
      </p>

      <p>
        FLACSO Zoom Uruguay utiliza Google Sign-In para autenticar usuarios. Cuando inicias sesion con Google,
        recibimos tu nombre, correo electronico y foto de perfil segun los permisos otorgados.
      </p>

      <p>
        Esta informacion se usa exclusivamente para crear y administrar tu cuenta en la plataforma, permitir el acceso
        a funcionalidades internas y mejorar la operacion del sistema.
      </p>

      <p>
        No vendemos datos personales. Solo compartimos informacion cuando sea necesario para operar el servicio, cumplir
        obligaciones legales o por requerimiento de autoridad competente.
      </p>

      <p>
        Si deseas solicitar acceso, correccion o eliminacion de tus datos, escribe a{" "}
        <strong>web@flacso.edu.uy</strong>.
      </p>

      <p>
        <Link href="/">Volver al inicio</Link>
      </p>
    </main>
  );
}
