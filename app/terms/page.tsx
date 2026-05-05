import Link from "next/link";

export const metadata = {
  title: "Terminos del Servicio | FLACSO Zoom Uruguay"
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px", lineHeight: 1.6 }}>
      <h1>Terminos del Servicio</h1>
      <p>
        Ultima actualizacion: 5 de mayo de 2026.
      </p>

      <p>
        Al usar FLACSO Zoom Uruguay, aceptas utilizar la plataforma de forma responsable y conforme a la normativa
        institucional vigente.
      </p>

      <p>
        El acceso se brinda para la gestion academica y operativa de actividades relacionadas con Zoom y servicios
        asociados.
      </p>

      <p>
        El usuario es responsable de la veracidad de la informacion que registra, del uso adecuado de sus credenciales y
        de mantener su cuenta protegida.
      </p>

      <p>
        FLACSO Uruguay puede actualizar estos terminos cuando sea necesario por razones operativas, legales o de
        seguridad.
      </p>

      <p>
        Para consultas sobre estos terminos o sobre el uso de la plataforma, contacta a{" "}
        <strong>web@flacso.edu.uy</strong>.
      </p>

      <p>
        <Link href="/">Volver al inicio</Link>
      </p>
    </main>
  );
}
