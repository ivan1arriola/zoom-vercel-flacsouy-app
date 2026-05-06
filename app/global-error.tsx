"use client";

import { useEffect } from "react";
import {
  buildSupportContactMessage,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO
} from "@/src/lib/support-contact";
import { reportSupportError } from "@/src/lib/support-error-report.client";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
    void reportSupportError({
      source: "next.global-error",
      message: error.message || "Fallo global de la aplicacion.",
      stack: error.stack,
      digest: error.digest
    });
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Roboto, 'Helvetica Neue', Arial, sans-serif",
          background: "#f8fafc",
          color: "#111827",
          padding: 20
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 760,
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            padding: 24,
            background: "#ffffff",
            boxShadow: "0 8px 30px rgba(15, 23, 42, 0.08)"
          }}
        >
          <h1 style={{ margin: "0 0 10px 0" }}>Error general de la aplicacion</h1>
          <p style={{ margin: "0 0 18px 0", lineHeight: 1.5 }}>
            {buildSupportContactMessage(
              "Ocurrio un problema inesperado y la app no pudo continuar."
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "10px 18px",
                background: "#1f4b8f",
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                borderRadius: 999,
                padding: "10px 18px",
                background: "#ffffff",
                border: "1px solid #d1d5db",
                color: "#111827",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              Recargar pagina
            </button>
            <a
              href={SUPPORT_MAILTO}
              style={{
                borderRadius: 999,
                padding: "10px 18px",
                background: "#ffffff",
                border: "1px solid #d1d5db",
                color: "#111827",
                textDecoration: "none",
                fontWeight: 600
              }}
            >
              Contactar a {SUPPORT_EMAIL}
            </a>
          </div>
        </section>
      </body>
    </html>
  );
}
