"use client";

import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type InlineLoginProps = {
  initialError?: string;
  verificationToken?: string;
  verificationEmail?: string;
  resetToken?: string;
};

export function InlineLogin({
  initialError,
  verificationToken,
  verificationEmail,
  resetToken
}: InlineLoginProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [info, setInfo] = useState("");

  const canAutoVerify = useMemo(
    () => Boolean(verificationToken && verificationEmail),
    [verificationEmail, verificationToken]
  );

  useEffect(() => {
    if (!canAutoVerify) return;

    let cancelled = false;

    async function verifyEmailOwnership() {
      setIsVerifying(true);
      setError("");
      const response = await fetch("/api/v1/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: verificationEmail,
          token: verificationToken
        })
      });
      const data = (await response.json()) as { error?: string; message?: string };
      if (cancelled) return;

      if (!response.ok) {
        setError(data.error ?? "No se pudo verificar el correo.");
      } else {
        setInfo(data.message ?? "Correo verificado. Ya puedes iniciar sesión.");
      }
      setIsVerifying(false);
    }

    void verifyEmailOwnership();

    return () => {
      cancelled = true;
    };
  }, [canAutoVerify, verificationEmail, verificationToken]);

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

  async function onGoogleSignIn() {
    setIsGoogleSubmitting(true);
    setError("");
    await signIn("google", { callbackUrl: "/" });
    setIsGoogleSubmitting(false);
  }

  async function onRegister(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("regEmail") ?? "").trim().toLowerCase();
    const password = String(formData.get("regPassword") ?? "");

    if (!email || !password) {
      setError("Completa email y contraseña para registrarte.");
      return;
    }

    setIsRegisterSubmitting(true);
    setError("");
    setInfo("");

    const response = await fetch("/api/v1/auth/register/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: name || undefined
      })
    });

    const data = (await response.json()) as { error?: string; message?: string; verificationUrl?: string };

    if (!response.ok) {
      setError(data.error ?? "No se pudo iniciar el registro.");
      setIsRegisterSubmitting(false);
      return;
    }

    if (data.verificationUrl) {
      setInfo(`Registro iniciado. Verifica tu correo. En desarrollo: ${data.verificationUrl}`);
    } else {
      setInfo(data.message ?? "Registro iniciado. Revisa tu correo para verificar tu cuenta.");
    }
    setIsRegisterSubmitting(false);
  }

  async function onRequestRecovery(formData: FormData) {
    const email = String(formData.get("recoveryEmail") ?? "").trim().toLowerCase();
    if (!email) {
      setError("Ingresa el correo para recuperar contraseña.");
      return;
    }

    setIsRecoverySubmitting(true);
    setError("");
    setInfo("");

    const response = await fetch("/api/v1/auth/password-recovery/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const data = (await response.json()) as { error?: string; message?: string; resetUrl?: string };

    if (!response.ok) {
      setError(data.error ?? "No se pudo procesar la recuperación.");
      setIsRecoverySubmitting(false);
      return;
    }

    if (data.resetUrl) {
      setInfo(`Si el correo existe, enviamos instrucciones. En desarrollo: ${data.resetUrl}`);
    } else {
      setInfo(data.message ?? "Si el correo existe, enviamos instrucciones de recuperación.");
    }

    setIsRecoverySubmitting(false);
  }

  async function onResetPassword(formData: FormData) {
    const email = String(formData.get("resetEmail") ?? "").trim().toLowerCase();
    const password = String(formData.get("resetPassword") ?? "");
    const confirmPassword = String(formData.get("resetPasswordConfirm") ?? "");

    if (!email || !resetToken) {
      setError("Falta email o token para restablecer la contraseña.");
      return;
    }

    if (password.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsResetSubmitting(true);
    setError("");
    setInfo("");

    const response = await fetch("/api/v1/auth/password-recovery/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token: resetToken, password })
    });

    const data = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(data.error ?? "No se pudo actualizar la contraseña.");
      setIsResetSubmitting(false);
      return;
    }

    setInfo(data.message ?? "Contraseña actualizada. Ya puedes iniciar sesión.");
    setIsResetSubmitting(false);
  }

  return (
    <section style={{ maxWidth: 460, margin: "0 auto" }}>
      <h1 className="title">Gestión Institucional de Salas Zoom</h1>
      <p className="muted">Inicia sesión para continuar o regístrate con tu correo institucional.</p>
      <article className="card" style={{ marginTop: 14 }}>
        <form action={onSubmit}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Email
            <input
              name="email"
              type="email"
              required
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
              autoComplete="current-password"
            />
          </label>
          <button className="btn primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
        <button
          className="btn ghost"
          type="button"
          style={{ marginTop: 10 }}
          onClick={onGoogleSignIn}
          disabled={isGoogleSubmitting}
        >
          {isGoogleSubmitting ? "Redirigiendo..." : "Ingresar con Google"}
        </button>
        <p className="muted" style={{ marginTop: 8 }}>
          Google requiere una cuenta verificada de <strong>@flacso.edu.uy</strong>.
        </p>
      </article>

      <article className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Autoregistro @flacso.edu.uy</h2>
        <form action={onRegister}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Nombre (opcional)
            <input name="name" type="text" autoComplete="name" />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Correo institucional
            <input
              name="regEmail"
              type="email"
              required
              placeholder="nombre@flacso.edu.uy"
              autoComplete="email"
            />
          </label>
          <label style={{ display: "block", marginBottom: 8 }}>
            Contraseña inicial
            <input name="regPassword" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn success" type="submit" disabled={isRegisterSubmitting}>
            {isRegisterSubmitting ? "Enviando verificación..." : "Registrarme"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 8 }}>
          Te enviaremos un enlace para demostrar que eres dueño de la cuenta.
        </p>
      </article>

      <article className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Recuperar contraseña</h2>
        <form action={onRequestRecovery}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Correo de la cuenta
            <input
              name="recoveryEmail"
              type="email"
              required
              placeholder="nombre@flacso.edu.uy"
              autoComplete="email"
            />
          </label>
          <button className="btn ghost" type="submit" disabled={isRecoverySubmitting}>
            {isRecoverySubmitting ? "Enviando enlace..." : "Enviar enlace de recuperación"}
          </button>
        </form>
      </article>

      {resetToken && verificationEmail ? (
        <article className="card" style={{ marginTop: 14 }}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Restablecer contraseña</h2>
          <p className="muted">Cuenta: {verificationEmail}</p>
          <form action={onResetPassword}>
            <input type="hidden" name="resetEmail" value={verificationEmail} />
            <label style={{ display: "block", marginBottom: 8 }}>
              Nueva contraseña
              <input name="resetPassword" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              Repetir nueva contraseña
              <input
                name="resetPasswordConfirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <button className="btn success" type="submit" disabled={isResetSubmitting}>
              {isResetSubmitting ? "Guardando..." : "Actualizar contraseña"}
            </button>
          </form>
        </article>
      ) : null}

      {isVerifying ? <p className="muted" style={{ marginTop: 12 }}>Verificando correo...</p> : null}
      {info ? (
        <p className="muted" style={{ marginTop: 12, color: "#1b6d2b" }}>
          {info}
        </p>
      ) : null}
      {error ? (
        <p className="muted" style={{ marginTop: 12, color: "#b00020" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
