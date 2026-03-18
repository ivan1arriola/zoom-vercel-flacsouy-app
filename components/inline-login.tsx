"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

type InlineLoginProps = {
  initialError?: string;
};

export function InlineLogin({ initialError }: InlineLoginProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  async function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setError("Ingresa email y contraseña.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setError("Credenciales inválidas.");
      return;
    }

    window.location.reload();
  }

  return (
    <section style={{ maxWidth: 460, margin: "0 auto" }}>
      <h1 className="title">Gestión Institucional de Salas Zoom</h1>
      <p className="muted">Inicia sesión para continuar.</p>
      <article className="card" style={{ marginTop: 14 }}>
        <form action={onSubmit}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Email
            <input
              name="email"
              type="email"
              required
              className="input"
              placeholder="admin@flacso.edu.uy"
              autoComplete="email"
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Contraseña
            <input
              name="password"
              type="password"
              required
              className="input"
              autoComplete="current-password"
            />
          </label>
          <button className="btn primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        {error ? (
          <p className="muted" style={{ marginTop: 12, color: "#b00020" }}>
            {error}
          </p>
        ) : null}
      </article>
    </section>
  );
}
