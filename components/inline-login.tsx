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
import { FlacsoBrandLogo } from "@/components/flacso-brand-logo";

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

    const existingLoginResult = await signIn("credentials", {
      email,
      password,
      redirect: false
    });

    if (existingLoginResult && !existingLoginResult.error) {
      setInfo("Ya tenias cuenta. Iniciando sesion...");
      setIsRegisterSubmitting(false);
      window.location.reload();
      return;
    }

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
      const normalizedError = (data.error ?? "").toLowerCase();
      const alreadyRegistered =
        normalizedError.includes("ya esta registrado") || normalizedError.includes("ya está registrado");

      if (alreadyRegistered) {
        const fallbackLoginResult = await signIn("credentials", {
          email,
          password,
          redirect: false
        });
        if (fallbackLoginResult && !fallbackLoginResult.error) {
          setInfo("Cuenta existente detectada. Iniciando sesion...");
          setIsRegisterSubmitting(false);
          window.location.reload();
          return;
        }
      }

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
    <Box
      sx={{
        minHeight: "85vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 4,
        px: 2,
        background: "radial-gradient(circle at 50% 50%, rgba(31, 75, 143, 0.05) 0%, rgba(246, 248, 252, 1) 100%)",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 450 }}>
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Stack direction="row" justifyContent="center" sx={{ mb: 2.5 }}>
            <FlacsoBrandLogo height={52} />
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 1, color: "primary.main", letterSpacing: "-0.5px" }}>
            Plataforma Zoom
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {activePanel === "login" && "Bienvenido de nuevo. Inicia sesión para continuar."}
            {activePanel === "register" && "Crea tu cuenta para empezar a coordinar salas."}
            {activePanel === "recovery" && "Recupera el acceso a tu cuenta fácilmente."}
            {activePanel === "activation" && "Estás a un paso de activar tu cuenta."}
          </Typography>
        </Box>

        <Card 
          variant="outlined" 
          sx={{ 
            borderRadius: "24px", 
            boxShadow: "0 20px 60px rgba(15, 26, 45, 0.08)",
            border: "1px solid",
            borderColor: "rgba(0, 0, 0, 0.06)",
            overflow: "visible",
            backgroundColor: "background.paper",
            position: "relative"
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Stack spacing={3}>
              {activePanel === "login" && (
                <Box component="form" action={onSubmit}>
                  <Stack spacing={2}>
                    <TextField 
                      fullWidth
                      name="email" 
                      label="Email" 
                      type="email" 
                      required 
                      autoComplete="email"
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                    />
                    <TextField
                      fullWidth
                      name="password"
                      label="Contraseña"
                      type={showLoginPassword ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
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
                    <Box sx={{ textAlign: "right" }}>
                      <Button 
                        size="small" 
                        variant="text" 
                        onClick={() => setActivePanel("recovery")}
                        sx={{ textTransform: "none", fontWeight: 600 }}
                      >
                        ¿Olvidaste tu contraseña?
                      </Button>
                    </Box>
                    <Button 
                      fullWidth
                      type="submit" 
                      variant="contained" 
                      size="large"
                      disabled={isSubmitting}
                      sx={{ 
                        borderRadius: "12px", 
                        py: 1.5, 
                        textTransform: "none", 
                        fontWeight: 700,
                        fontSize: "1rem",
                        boxShadow: "0 8px 20px rgba(31, 75, 143, 0.25)"
                      }}
                    >
                      {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Iniciar Sesión"}
                    </Button>
                  </Stack>
                </Box>
              )}

              {activePanel === "register" && (
                <Box component="form" action={onRegister}>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField 
                        fullWidth 
                        name="firstName" 
                        label="Nombre" 
                        autoComplete="given-name"
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                      />
                      <TextField 
                        fullWidth 
                        name="lastName" 
                        label="Apellido" 
                        autoComplete="family-name"
                        sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                      />
                    </Stack>
                    <TextField 
                      fullWidth
                      name="regEmail" 
                      label="Correo electrónico" 
                      type="email" 
                      required 
                      autoComplete="email"
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                    />
                    <TextField
                      fullWidth
                      name="regPassword"
                      label="Contraseña"
                      type={showRegisterPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      inputProps={{ minLength: 8 }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
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
                    <Button 
                      fullWidth
                      type="submit" 
                      variant="contained" 
                      color="secondary"
                      size="large"
                      disabled={isRegisterSubmitting}
                      sx={{ 
                        borderRadius: "12px", 
                        py: 1.5, 
                        textTransform: "none", 
                        fontWeight: 700,
                        fontSize: "1rem"
                      }}
                    >
                      {isRegisterSubmitting ? <CircularProgress size={24} color="inherit" /> : "Crear Cuenta"}
                    </Button>
                  </Stack>
                </Box>
              )}

              {activePanel === "recovery" && !hasResetPayload && (
                <Box component="form" action={onRequestRecovery}>
                  <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mb: 1 }}>
                      Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
                    </Typography>
                    <TextField
                      fullWidth
                      name="recoveryEmail"
                      label="Correo electrónico"
                      type="email"
                      required
                      autoComplete="email"
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                    />
                    <Button 
                      fullWidth
                      type="submit" 
                      variant="contained" 
                      size="large"
                      disabled={isRecoverySubmitting}
                      sx={{ borderRadius: "12px", py: 1.5, textTransform: "none", fontWeight: 700 }}
                    >
                      {isRecoverySubmitting ? <CircularProgress size={24} color="inherit" /> : "Enviar enlace"}
                    </Button>
                    <Button 
                      fullWidth
                      variant="text" 
                      onClick={() => setActivePanel("login")}
                      sx={{ textTransform: "none", fontWeight: 600 }}
                    >
                      Volver al inicio de sesión
                    </Button>
                  </Stack>
                </Box>
              )}

              {(activePanel === "activation" || (activePanel === "recovery" && hasResetPayload)) && (
                <Box component="form" action={onResetPassword}>
                  <Stack spacing={2}>
                    <Typography variant="body2" sx={{ textAlign: "center", fontWeight: 600 }}>
                      Cuenta: {verificationEmail}
                    </Typography>
                    <TextField
                      fullWidth
                      name="resetPassword"
                      label="Nueva contraseña"
                      type={showResetPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      inputProps={{ minLength: 8 }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
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
                      fullWidth
                      name="resetPasswordConfirm"
                      label="Confirmar contraseña"
                      type={showResetPasswordConfirm ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      inputProps={{ minLength: 8 }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
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
                    <Button 
                      fullWidth
                      type="submit" 
                      variant="contained" 
                      color="secondary"
                      size="large"
                      disabled={isResetSubmitting}
                      sx={{ borderRadius: "12px", py: 1.5, textTransform: "none", fontWeight: 700 }}
                    >
                      {isResetSubmitting ? <CircularProgress size={24} color="inherit" /> : isActivationFlow ? "Activar Cuenta" : "Restablecer Contraseña"}
                    </Button>
                  </Stack>
                </Box>
              )}

              {(activePanel === "login" || activePanel === "register") && (
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", my: 2 }}>
                    <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
                    <Typography variant="caption" sx={{ px: 2, color: "text.disabled", fontWeight: 700 }}>
                      O CONTINÚA CON
                    </Typography>
                    <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
                  </Box>

                  <Button
                    fullWidth
                    variant="outlined"
                    size="large"
                    onClick={onGoogleSignIn}
                    disabled={isGoogleSubmitting}
                    startIcon={<GoogleIcon />}
                    sx={{ 
                      borderRadius: "12px", 
                      py: 1.2, 
                      textTransform: "none", 
                      fontWeight: 600,
                      borderColor: "rgba(0, 0, 0, 0.12)",
                      color: "text.primary",
                      "&:hover": {
                        borderColor: "primary.main",
                        backgroundColor: "rgba(31, 75, 143, 0.04)"
                      }
                    }}
                  >
                    {isGoogleSubmitting ? "Cargando..." : "Google"}
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block", textAlign: "center", lineHeight: 1.4 }}>
                    {googleDomainNotice}
                  </Typography>
                </Box>
              )}
            </Stack>
          </CardContent>

          <Box 
            sx={{ 
              py: 2.5, 
              px: 4, 
              borderTop: "1px solid", 
              borderColor: "divider", 
              bgcolor: "rgba(0, 0, 0, 0.01)",
              borderBottomLeftRadius: "24px",
              borderBottomRightRadius: "24px",
              textAlign: "center"
            }}
          >
            {activePanel === "login" && (
              <Typography variant="body2" color="text.secondary">
                ¿No tienes una cuenta?{" "}
                <Button 
                  variant="text" 
                  size="small" 
                  onClick={() => setActivePanel("register")}
                  sx={{ textTransform: "none", fontWeight: 700, p: 0, minWidth: "auto", verticalAlign: "baseline" }}
                >
                  Regístrate
                </Button>
              </Typography>
            )}
            {activePanel === "register" && (
              <Typography variant="body2" color="text.secondary">
                ¿Ya tienes una cuenta?{" "}
                <Button 
                  variant="text" 
                  size="small" 
                  onClick={() => setActivePanel("login")}
                  sx={{ textTransform: "none", fontWeight: 700, p: 0, minWidth: "auto", verticalAlign: "baseline" }}
                >
                  Inicia sesión
                </Button>
              </Typography>
            )}
            {(activePanel === "recovery" || activePanel === "activation") && !hasResetPayload && (
              <Button 
                variant="text" 
                size="small" 
                onClick={() => setActivePanel("login")}
                sx={{ textTransform: "none", fontWeight: 700 }}
              >
                Volver al inicio de sesión
              </Button>
            )}
          </Box>
        </Card>

        <Box sx={{ mt: 3, textAlign: "center" }} aria-live="polite">
          {isVerifying ? (
            <Stack direction="row" spacing={1} justifyContent="center" alignItems="center">
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Verificando correo...
              </Typography>
            </Stack>
          ) : null}
          {info ? <Alert severity="success" sx={{ mt: 1, borderRadius: "12px" }}>{info}</Alert> : null}
          {error ? <Alert severity="error" sx={{ mt: 1, borderRadius: "12px" }}>{error}</Alert> : null}
        </Box>
      </Box>
    </Box>
  );
}
