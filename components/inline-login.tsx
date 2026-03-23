"use client";

import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

type InlineLoginProps = {
  initialError?: string;
  verificationToken?: string;
  verificationEmail?: string;
  resetToken?: string;
  resetMode?: string;
};

type AuthPanel = "login" | "register" | "recovery" | "activation";
type PasswordFlowMode = "recovery" | "activation";

function mapAuthError(raw?: string): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value === "AccessDenied") {
    return "Google solo esta habilitado para cuentas @flacso.edu.uy. Usa registro por correo.";
  }
  return value;
}

function normalizeResetMode(raw?: string): PasswordFlowMode {
  return raw?.trim().toLowerCase() === "activation" ? "activation" : "recovery";
}

export function InlineLogin({
  initialError,
  verificationToken,
  verificationEmail,
  resetToken,
  resetMode
}: InlineLoginProps) {
  const [activePanel, setActivePanel] = useState<AuthPanel>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [error, setError] = useState(mapAuthError(initialError));
  const [info, setInfo] = useState("");

  const canAutoVerify = useMemo(
    () => Boolean(verificationToken && verificationEmail),
    [verificationEmail, verificationToken]
  );

  const hasResetPayload = useMemo(
    () => Boolean(resetToken && verificationEmail),
    [resetToken, verificationEmail]
  );

  const passwordFlowMode = useMemo<PasswordFlowMode>(() => normalizeResetMode(resetMode), [resetMode]);
  const isActivationFlow = hasResetPayload && passwordFlowMode === "activation";

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
        setInfo(data.message ?? "Correo verificado. Ya puedes iniciar sesion.");
      }
      setIsVerifying(false);
    }

    void verifyEmailOwnership();

    return () => {
      cancelled = true;
    };
  }, [canAutoVerify, verificationEmail, verificationToken]);

  useEffect(() => {
    if (!hasResetPayload) return;
    setActivePanel(isActivationFlow ? "activation" : "recovery");
  }, [hasResetPayload, isActivationFlow]);

  async function onSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setError("Ingresa email y contrasena.");
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
      setError("Credenciales invalidas.");
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
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("regEmail") ?? "").trim().toLowerCase();
    const password = String(formData.get("regPassword") ?? "");

    if (!email || !password) {
      setError("Completa email y contrasena para registrarte.");
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
        firstName: firstName || undefined,
        lastName: lastName || undefined
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
      setError("Ingresa el correo para recuperar contrasena.");
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
      setError(data.error ?? "No se pudo procesar la recuperacion.");
      setIsRecoverySubmitting(false);
      return;
    }

    if (data.resetUrl) {
      setInfo(`Si el correo existe, enviamos instrucciones. En desarrollo: ${data.resetUrl}`);
    } else {
      setInfo(data.message ?? "Si el correo existe, enviamos instrucciones de recuperacion.");
    }

    setIsRecoverySubmitting(false);
  }

  async function onResetPassword(formData: FormData) {
    const email = String(formData.get("resetEmail") ?? "").trim().toLowerCase();
    const password = String(formData.get("resetPassword") ?? "");
    const confirmPassword = String(formData.get("resetPasswordConfirm") ?? "");

    if (!email || !resetToken) {
      setError("Falta email o token para restablecer la contrasena.");
      return;
    }

    if (password.length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    setIsResetSubmitting(true);
    setError("");
    setInfo("");

    const response = await fetch("/api/v1/auth/password-recovery/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token: resetToken, password, mode: isActivationFlow ? "activation" : "recovery" })
    });

    const data = (await response.json()) as { error?: string; message?: string };

    if (!response.ok) {
      setError(data.error ?? "No se pudo actualizar la contrasena.");
      setIsResetSubmitting(false);
      return;
    }

    setInfo(
      data.message ??
        (isActivationFlow
          ? "Cuenta activada. Ya puedes iniciar sesion."
          : "Contrasena actualizada. Ya puedes iniciar sesion.")
    );
    setIsResetSubmitting(false);
  }

  function renderResetForm(options: { title: string; submitLabel: string; helper: string }) {
    if (!verificationEmail) return null;

    return (
      <article className="card auth-card auth-card-wide">
        <h2 className="auth-card-title">{options.title}</h2>
        <p className="muted auth-help">Cuenta: {verificationEmail}</p>
        <p className="muted auth-help" style={{ marginTop: 0 }}>{options.helper}</p>
        <form action={onResetPassword} className="auth-form" aria-busy={isResetSubmitting}>
          <input type="hidden" name="resetEmail" value={verificationEmail} />
          <label>
            Nueva contrasena
            <div className="auth-password-field">
              <input
                name="resetPassword"
                type={showResetPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowResetPassword((prev) => !prev)}
              >
                {showResetPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>
          <label>
            Repetir nueva contrasena
            <div className="auth-password-field">
              <input
                name="resetPasswordConfirm"
                type={showResetPasswordConfirm ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowResetPasswordConfirm((prev) => !prev)}
              >
                {showResetPasswordConfirm ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </label>
          <button className="btn success" type="submit" disabled={isResetSubmitting}>
            {isResetSubmitting ? "Actualizando contrasena..." : options.submitLabel}
          </button>
          {isResetSubmitting ? <p className="muted auth-help">Actualizando contrasena, espera un momento...</p> : null}
        </form>
      </article>
    );
  }

  return (
    <section className="auth-shell">
      <header className="auth-header">
        <p className="auth-kicker">FLACSO Uruguay</p>
        <h1 className="title">Herramienta para coordinar salas Zoom</h1>
        <p className="muted">Inicia sesion para continuar. Google solo para @flacso.edu.uy; el resto por correo y contrasena.</p>
      </header>

      <nav className="auth-tabs" aria-label="Opciones de autenticacion">
        <button
          type="button"
          className={`auth-tab ${activePanel === "login" ? "is-active" : ""}`}
          onClick={() => setActivePanel("login")}
        >
          Acceder
        </button>
        <button
          type="button"
          className={`auth-tab ${activePanel === "register" ? "is-active" : ""}`}
          onClick={() => setActivePanel("register")}
        >
          Registrarse
        </button>
        <button
          type="button"
          className={`auth-tab ${activePanel === "recovery" ? "is-active" : ""}`}
          onClick={() => setActivePanel("recovery")}
        >
          Recuperar
        </button>
        {isActivationFlow ? (
          <button
            type="button"
            className={`auth-tab ${activePanel === "activation" ? "is-active" : ""}`}
            onClick={() => setActivePanel("activation")}
          >
            Activar cuenta
          </button>
        ) : null}
      </nav>

      <div className="auth-grid">
        {activePanel === "login" ? (
          <article className="card auth-card auth-card-wide">
            <h2 className="auth-card-title">Acceso</h2>
            <form action={onSubmit} className="auth-form">
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="usuario@dominio.com"
                  autoComplete="email"
                />
              </label>
              <label>
                Contrasena
                <input name="password" type="password" required autoComplete="current-password" />
              </label>
              <button className="btn primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Ingresando..." : "Ingresar"}
              </button>
            </form>

            <button
              className="btn auth-google-btn"
              type="button"
              onClick={onGoogleSignIn}
              disabled={isGoogleSubmitting}
            >
              <span className="google-mark" aria-hidden="true">
                <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" focusable="false">
                  <path d="M17.64 9.2c0-.64-.06-1.26-.16-1.86H9v3.52h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.56 2.68-3.86 2.68-6.64z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.46-.8 5.95-2.16l-2.92-2.26c-.8.54-1.84.86-3.03.86-2.33 0-4.3-1.58-5-3.7H.98V13.1A9 9 0 0 0 9 18z" fill="#34A853" />
                  <path d="M4 10.74A5.4 5.4 0 0 1 3.72 9c0-.6.1-1.18.28-1.74V4.9H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.1L4 10.74z" fill="#FBBC05" />
                  <path d="M9 3.58c1.32 0 2.5.46 3.43 1.34l2.56-2.56C13.45.92 11.42 0 9 0A9 9 0 0 0 .98 4.9L4 7.26c.7-2.12 2.67-3.68 5-3.68z" fill="#EA4335" />
                </svg>
              </span>
              <span>{isGoogleSubmitting ? "Redirigiendo..." : "Ingresar con Google"}</span>
            </button>
            <p className="muted auth-help">Google solo disponible para cuentas @flacso.edu.uy.</p>
          </article>
        ) : null}

        {activePanel === "register" ? (
          <article className="card auth-card auth-card-wide">
            <h2 className="auth-card-title">Autoregistro por correo</h2>
            <button
              className="btn auth-google-btn"
              type="button"
              onClick={onGoogleSignIn}
              disabled={isGoogleSubmitting}
            >
              <span className="google-mark" aria-hidden="true">
                <svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" focusable="false">
                  <path d="M17.64 9.2c0-.64-.06-1.26-.16-1.86H9v3.52h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.56 2.68-3.86 2.68-6.64z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.46-.8 5.95-2.16l-2.92-2.26c-.8.54-1.84.86-3.03.86-2.33 0-4.3-1.58-5-3.7H.98V13.1A9 9 0 0 0 9 18z" fill="#34A853" />
                  <path d="M4 10.74A5.4 5.4 0 0 1 3.72 9c0-.6.1-1.18.28-1.74V4.9H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.1L4 10.74z" fill="#FBBC05" />
                  <path d="M9 3.58c1.32 0 2.5.46 3.43 1.34l2.56-2.56C13.45.92 11.42 0 9 0A9 9 0 0 0 .98 4.9L4 7.26c.7-2.12 2.67-3.68 5-3.68z" fill="#EA4335" />
                </svg>
              </span>
              <span>{isGoogleSubmitting ? "Redirigiendo..." : "Registrarme con Google"}</span>
            </button>
            <p className="muted auth-help">Google crea cuenta automaticamente solo para correos @flacso.edu.uy.</p>
            <form action={onRegister} className="auth-form">
              <div className="auth-row-2">
                <label>
                  Nombre
                  <input name="firstName" type="text" autoComplete="given-name" placeholder="Nombre" />
                </label>
                <label>
                  Apellido
                  <input name="lastName" type="text" autoComplete="family-name" placeholder="Apellido" />
                </label>
              </div>
              <label>
                Correo electronico
                <input
                  name="regEmail"
                  type="email"
                  required
                  placeholder="nombre@dominio.com"
                  autoComplete="email"
                />
              </label>
              <label>
                Contrasena inicial
                <input name="regPassword" type="password" required minLength={8} autoComplete="new-password" />
              </label>
              <button className="btn success" type="submit" disabled={isRegisterSubmitting}>
                {isRegisterSubmitting ? "Enviando verificacion..." : "Registrarme"}
              </button>
            </form>
            <p className="muted auth-help">Te enviaremos un enlace para demostrar que eres dueno de la cuenta.</p>
          </article>
        ) : null}

        {activePanel === "recovery" ? (
          <article className="card auth-card auth-card-wide">
            <h2 className="auth-card-title">Recuperar contrasena</h2>
            <form action={onRequestRecovery} className="auth-form">
              <label>
                Correo de la cuenta
                <input
                  name="recoveryEmail"
                  type="email"
                  required
                  placeholder="nombre@dominio.com"
                  autoComplete="email"
                />
              </label>
              <button className="btn ghost" type="submit" disabled={isRecoverySubmitting}>
                {isRecoverySubmitting ? "Enviando enlace..." : "Enviar enlace de recuperacion"}
              </button>
            </form>
          </article>
        ) : null}

        {!isActivationFlow && hasResetPayload && activePanel === "recovery"
          ? renderResetForm({
              title: "Restablecer contrasena",
              submitLabel: "Actualizar contrasena",
              helper: "Define una nueva contrasena para recuperar tu acceso."
            })
          : null}

        {isActivationFlow && hasResetPayload && activePanel === "activation"
          ? renderResetForm({
              title: "Activar cuenta",
              submitLabel: "Activar cuenta",
              helper: "Este paso completa la creacion de tu cuenta."
            })
          : null}
      </div>

      <div className="auth-feedback" aria-live="polite">
        {isVerifying ? <p className="muted">Verificando correo...</p> : null}
        {info ? <p className="auth-feedback-ok">{info}</p> : null}
        {error ? <p className="auth-feedback-error">{error}</p> : null}
      </div>
    </section>
  );
}

