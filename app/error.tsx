"use client";

import { useEffect } from "react";
import {
  buildSupportContactMessage,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO
} from "@/src/lib/support-contact";
import { reportSupportError } from "@/src/lib/support-error-report.client";

type PageErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PageError({ error, reset }: PageErrorProps) {
  useEffect(() => {
    console.error(error);
    void reportSupportError({
      source: "next.error",
      message: error.message || "Error de aplicacion no controlado.",
      stack: error.stack,
      digest: error.digest
    });
  }, [error]);

  return (
    <section
      style={{
        maxWidth: 720,
        margin: "40px auto",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 24,
        background: "#fff8f8",
        color: "#111827"
      }}
    >
      <h2 style={{ margin: "0 0 12px 0" }}>Se produjo un error</h2>
      <p style={{ margin: "0 0 20px 0" }}>
        {buildSupportContactMessage("No pudimos completar la operacion.")}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
  );
}
