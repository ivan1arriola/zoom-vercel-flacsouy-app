"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import PersonAddAlt1RoundedIcon from "@mui/icons-material/PersonAddAlt1Rounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { formatManagedUserRole, formatManagedUserDate } from "./spa-tabs-utils";
import type { ManagedUser } from "@/src/services/userApi";

interface CreateUserForm {
  firstName: string;
  lastName: string;
  emails: string;
  role: string;
}

interface SpaTabUsuariosProps {
  users: ManagedUser[];
  createUserForm: CreateUserForm;
  setCreateUserForm: (form: CreateUserForm | ((prev: CreateUserForm) => CreateUserForm)) => void;
  isCreatingUser: boolean;
  updatingUserId: string | null;
  resendingActivationUserId: string | null;
  isSendingSelfActivationLink: boolean;
  isLoadingUsers: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateUserRole: (userId: string, role: string, emails: string[]) => void | Promise<void>;
  onResendActivationLink: (userId: string) => void | Promise<void>;
  onSendSelfActivationLinkTest: () => void | Promise<void>;
  onRefresh: () => void;
}

type EditableRole = "DOCENTE" | "ASISTENTE_ZOOM" | "CONTADURIA" | "ADMINISTRADOR";

const ROLE_OPTIONS: Array<{ value: EditableRole; label: string }> = [
  { value: "DOCENTE", label: "Docente" },
  { value: "ASISTENTE_ZOOM", label: "Asistente Zoom" },
  { value: "CONTADURIA", label: "Contaduria" },
  { value: "ADMINISTRADOR", label: "Administrador" }
];

function normalizeEditableRole(role: string): EditableRole {
  if (role === "ADMINISTRADOR") return "ADMINISTRADOR";
  if (role === "CONTADURIA") return "CONTADURIA";
  if (role === "ASISTENTE_ZOOM" || role === "SOPORTE_ZOOM") return "ASISTENTE_ZOOM";
  return "DOCENTE";
}

function parseEmailLines(raw: string): string[] {
  const unique = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const normalized = line.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique.values());
}

export function SpaTabUsuarios({
  users,
  createUserForm,
  setCreateUserForm,
  isCreatingUser,
  updatingUserId,
  resendingActivationUserId,
  isSendingSelfActivationLink,
  isLoadingUsers,
  onSubmit,
  onUpdateUserRole,
  onResendActivationLink,
  onSendSelfActivationLinkTest,
  onRefresh
}: SpaTabUsuariosProps) {
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, EditableRole>>({});
  const [selectedEmailsByUser, setSelectedEmailsByUser] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextState: Record<string, EditableRole> = {};
    const nextEmailsState: Record<string, string> = {};
    for (const managedUser of users) {
      nextState[managedUser.id] = normalizeEditableRole(managedUser.role);
      const accessEmails = managedUser.emails && managedUser.emails.length > 0 ? managedUser.emails : [managedUser.email];
      nextEmailsState[managedUser.id] = accessEmails.join("\n");
    }
    setSelectedRoleByUser(nextState);
    setSelectedEmailsByUser(nextEmailsState);
  }, [users]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <CardContent sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 1.8 }}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={(theme) => ({
                  width: 34,
                  height: 34,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  color: "primary.main",
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  border: "1px solid",
                  borderColor: alpha(theme.palette.primary.main, 0.22)
                })}
              >
                <ManageAccountsRoundedIcon fontSize="small" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                Gestion de usuarios
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.65, maxWidth: 640 }}>
              Crea cuentas, asigna roles y gestiona activaciones desde un unico flujo.
            </Typography>
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button
              variant="outlined"
              startIcon={<MailOutlineRoundedIcon />}
              onClick={() => {
                void onSendSelfActivationLinkTest();
              }}
              disabled={isSendingSelfActivationLink}
              sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700, px: 1.6 }}
            >
              {isSendingSelfActivationLink ? "Enviando prueba..." : "Enviarme prueba"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshRoundedIcon />}
              onClick={onRefresh}
              disabled={isLoadingUsers}
              sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700, px: 1.6 }}
            >
              {isLoadingUsers ? "Actualizando..." : "Actualizar"}
            </Button>
          </Stack>
        </Stack>

        <Paper
          variant="outlined"
          sx={(theme) => ({
            mb: 2.2,
            p: { xs: 1.2, sm: 1.6 },
            borderRadius: 2.6,
            borderColor: alpha(theme.palette.primary.main, 0.24),
            background: `linear-gradient(140deg, ${alpha(theme.palette.primary.main, 0.07)} 0%, ${alpha(
              theme.palette.success.main,
              0.05
            )} 100%)`
          })}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.2 }}>
            Crear nuevo usuario
          </Typography>
          <Box component="form" onSubmit={onSubmit}>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 1.1
              }}
            >
              <TextField
                label="Nombre"
                size="small"
                value={createUserForm.firstName}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
              />
              <TextField
                label="Apellido"
                size="small"
                value={createUserForm.lastName}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
              />
              <TextField
                label="Correos de acceso"
                required
                size="small"
                multiline
                minRows={2}
                value={createUserForm.emails}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, emails: e.target.value }))}
                helperText="Ingresa uno o varios correos, uno por linea. El primero queda como principal."
              />
              <TextField
                label="Rol"
                select
                size="small"
                value={createUserForm.role}
                onChange={(e) => setCreateUserForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                {ROLE_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>
              El usuario se crea sin contrasena y recibe un enlace de activacion para definir su contrasena.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>
              Los enlaces de activacion vencen en 7 dias. Las cuentas @flacso.edu.uy tambien pueden ingresar con Google.
            </Typography>
            <Button
              sx={{ mt: 1.3, textTransform: "none", borderRadius: 2, fontWeight: 700 }}
              type="submit"
              variant="contained"
              startIcon={<PersonAddAlt1RoundedIcon />}
              disabled={isCreatingUser}
            >
              {isCreatingUser ? "Creando usuario..." : "Crear usuario y enviar enlace"}
            </Button>
          </Box>
        </Paper>

        <Box sx={{ mb: 1.2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Usuarios registrados ({users.length})
          </Typography>
        </Box>

        {isLoadingUsers ? (
          <Typography variant="body2" color="text.secondary">
            Cargando usuarios...
          </Typography>
        ) : users.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No hay usuarios registrados.
          </Typography>
        ) : (
          <Stack spacing={1.05}>
            {users.map((managedUser) => {
              const fullName =
                [managedUser.firstName, managedUser.lastName].filter(Boolean).join(" ") || "-";
              const currentRole = normalizeEditableRole(managedUser.role);
              const selectedRole = selectedRoleByUser[managedUser.id] ?? currentRole;
              const currentEmails = managedUser.emails && managedUser.emails.length > 0 ? managedUser.emails : [managedUser.email];
              const selectedEmailsRaw = selectedEmailsByUser[managedUser.id] ?? currentEmails.join("\n");
              const selectedEmails = parseEmailLines(selectedEmailsRaw);
              const hasEmailValidationError = selectedEmails.length === 0;
              const roleChanged = selectedRole !== currentRole;
              const emailsChanged =
                selectedEmails.length !== currentEmails.length ||
                selectedEmails.some((email, index) => email !== currentEmails[index]);
              const isUpdatingRole = updatingUserId === managedUser.id;
              const isResendingActivation = resendingActivationUserId === managedUser.id;
              const canSaveRole =
                !isUpdatingRole &&
                !hasEmailValidationError &&
                (roleChanged || emailsChanged);
              const canResendActivation = !managedUser.emailVerified;
              const verificationLabel = managedUser.emailVerified ? "Verificado" : "Sin verificar";

              return (
                <Paper
                  key={managedUser.id}
                  variant="outlined"
                  sx={(theme) => ({
                    p: { xs: 1.2, sm: 1.4 },
                    borderRadius: 2.2,
                    borderLeftWidth: 4,
                    borderLeftStyle: "solid",
                    borderLeftColor: managedUser.emailVerified
                      ? theme.palette.success.main
                      : theme.palette.warning.main,
                    bgcolor: managedUser.emailVerified
                      ? alpha(theme.palette.success.main, 0.04)
                      : alpha(theme.palette.warning.main, 0.07),
                    transition: "box-shadow 160ms ease, transform 160ms ease",
                    "&:hover": {
                      boxShadow: `0 8px 16px ${alpha(theme.palette.common.black, 0.08)}`,
                      transform: "translateY(-1px)"
                    }
                  })}
                >
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                        {managedUser.email}
                      </Typography>
                      {managedUser.emails && managedUser.emails.length > 1 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                          Acceso alternativo: {managedUser.emails.slice(1).join(" | ")}
                        </Typography>
                      ) : null}
                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.65 }}>
                        <Chip size="small" variant="outlined" label={formatManagedUserRole(managedUser.role)} />
                        <Chip
                          size="small"
                          color={managedUser.emailVerified ? "success" : "warning"}
                          icon={
                            managedUser.emailVerified ? (
                              <VerifiedUserRoundedIcon fontSize="small" />
                            ) : (
                              <ErrorOutlineRoundedIcon fontSize="small" />
                            )
                          }
                          label={verificationLabel}
                        />
                      </Stack>
                    </Box>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Alta: ${formatManagedUserDate(managedUser.createdAt)}`}
                    />
                  </Stack>

                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Nombre completo
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {fullName}
                    </Typography>
                  </Box>

                  <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", lg: "center" }}
                    sx={{ mt: 1.25 }}
                  >
                    <TextField
                      label="Correos de acceso"
                      size="small"
                      multiline
                      minRows={2}
                      value={selectedEmailsRaw}
                      onChange={(event) =>
                        setSelectedEmailsByUser((prev) => ({
                          ...prev,
                          [managedUser.id]: event.target.value
                        }))
                      }
                      error={hasEmailValidationError}
                      helperText={
                        hasEmailValidationError
                          ? "Debes indicar al menos un correo."
                          : "Uno por linea. El primero queda como correo principal."
                      }
                      sx={{ minWidth: 260, flex: 1 }}
                    />
                    <TextField
                      label="Rol"
                      select
                      size="small"
                      value={selectedRole}
                      onChange={(event) =>
                        setSelectedRoleByUser((prev) => ({
                          ...prev,
                          [managedUser.id]: event.target.value as EditableRole
                        }))
                      }
                      sx={{ minWidth: 230, maxWidth: 320 }}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant={canSaveRole ? "contained" : "outlined"}
                      disabled={!canSaveRole}
                      onClick={() => {
                        void onUpdateUserRole(managedUser.id, selectedRole, selectedEmails);
                      }}
                      sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700 }}
                    >
                      {isUpdatingRole ? "Guardando..." : "Guardar cambios"}
                    </Button>
                    {canResendActivation ? (
                      <Button
                        variant="outlined"
                        color="warning"
                        disabled={isResendingActivation}
                        startIcon={<MailOutlineRoundedIcon />}
                        onClick={() => {
                          void onResendActivationLink(managedUser.id);
                        }}
                        sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700 }}
                      >
                        {isResendingActivation ? "Enviando..." : "Reenviar activacion"}
                      </Button>
                    ) : null}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
