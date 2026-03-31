"use client";

import { signIn } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import GoogleIcon from "@mui/icons-material/Google";

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
  const googleDomainNotice = "Google solo para @flacso.edu.uy; el resto por correo y contrasena.";
  const [activePanel, setActivePanel] = useState<AuthPanel>("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetPasswordConfirm, setShowResetPasswordConfirm] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
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
    const email = (verificationEmail ?? "").trim().toLowerCase();
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
      <Card variant="outlined" sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            {options.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cuenta: {verificationEmail}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {options.helper}
          </Typography>
          <Box component="form" action={onResetPassword}>
            <Stack spacing={1.2}>
              <TextField
                name="resetPassword"
                label="Nueva contrasena"
                type={showResetPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                inputProps={{ minLength: 8 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowResetPassword((prev) => !prev)} edge="end">
                        {showResetPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                name="resetPasswordConfirm"
                label="Repetir nueva contrasena"
                type={showResetPasswordConfirm ? "text" : "password"}
                required
                autoComplete="new-password"
                inputProps={{ minLength: 8 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowResetPasswordConfirm((prev) => !prev)} edge="end">
                        {showResetPasswordConfirm ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <Button type="submit" variant="contained" color="secondary" disabled={isResetSubmitting}>
                {isResetSubmitting ? "Actualizando contrasena..." : options.submitLabel}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box component="section">
      <Box sx={{ maxWidth: 980, mx: "auto" }}>
        <Typography variant="overline" color="primary.main" sx={{ fontWeight: 700 }}>
          FLACSO Uruguay
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          Herramienta para coordinar salas Zoom
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Inicia sesion para continuar.
        </Typography>

        <Tabs
          value={activePanel}
          onChange={(_event, value) => setActivePanel(value as AuthPanel)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab value="login" label="Acceder" />
          <Tab value="register" label="Registrarse" />
          <Tab value="recovery" label="Recuperar" />
          {isActivationFlow ? <Tab value="activation" label="Activar cuenta" /> : null}
        </Tabs>

        <Stack spacing={1.5}>
          {activePanel === "login" ? (
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  Acceso
                </Typography>
                <Box component="form" action={onSubmit}>
                  <Stack spacing={1.2}>
                    <TextField name="email" label="Email" type="email" required autoComplete="email" />
                    <TextField
                      name="password"
                      label="Contrasena"
                      type={showLoginPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowLoginPassword((prev) => !prev)} edge="end">
                              {showLoginPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                    <Button type="submit" variant="contained" disabled={isSubmitting}>
                      {isSubmitting ? "Ingresando..." : "Ingresar"}
                    </Button>
                  </Stack>
                </Box>
                <Button
                  sx={{ mt: 1.2 }}
                  fullWidth
                  variant="outlined"
                  onClick={onGoogleSignIn}
                  disabled={isGoogleSubmitting}
                  startIcon={<GoogleIcon />}
                >
                  {isGoogleSubmitting ? "Redirigiendo..." : "Ingresar con Google"}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.8, display: "block" }}>
                  {googleDomainNotice}
                </Typography>
              </CardContent>
            </Card>
          ) : null}

          {activePanel === "register" ? (
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  Autoregistro por correo
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  onClick={onGoogleSignIn}
                  disabled={isGoogleSubmitting}
                  startIcon={<GoogleIcon />}
                  sx={{ mb: 1.2 }}
                >
                  {isGoogleSubmitting ? "Redirigiendo..." : "Registrarme con Google"}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1.2, display: "block" }}>
                  {googleDomainNotice}
                </Typography>
                <Box component="form" action={onRegister}>
                  <Stack spacing={1.2}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                      <TextField name="firstName" label="Nombre" fullWidth autoComplete="given-name" />
                      <TextField name="lastName" label="Apellido" fullWidth autoComplete="family-name" />
                    </Stack>
                    <TextField name="regEmail" label="Correo electronico" type="email" required autoComplete="email" />
                    <TextField
                      name="regPassword"
                      label="Contrasena inicial"
                      type={showRegisterPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      inputProps={{ minLength: 8 }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton onClick={() => setShowRegisterPassword((prev) => !prev)} edge="end">
                              {showRegisterPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                    <Button type="submit" variant="contained" color="secondary" disabled={isRegisterSubmitting}>
                      {isRegisterSubmitting ? "Enviando verificacion..." : "Registrarme"}
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          ) : null}

          {activePanel === "recovery" ? (
            <Card variant="outlined" sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
                  Recuperar contrasena
                </Typography>
                <Box component="form" action={onRequestRecovery}>
                  <Stack spacing={1.2}>
                    <TextField
                      name="recoveryEmail"
                      label="Correo de la cuenta"
                      type="email"
                      required
                      autoComplete="email"
                    />
                    <Button type="submit" variant="outlined" disabled={isRecoverySubmitting}>
                      {isRecoverySubmitting ? "Enviando enlace..." : "Enviar enlace de recuperacion"}
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
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
        </Stack>

        <Box sx={{ mt: 2 }} aria-live="polite">
          {isVerifying ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Verificando correo...
              </Typography>
            </Stack>
          ) : null}
          {info ? <Alert severity="success" sx={{ mt: 1 }}>{info}</Alert> : null}
          {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
        </Box>
      </Box>
    </Box>
  );
}
