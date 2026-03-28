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
import { formatManagedUserRole, formatManagedUserDate } from "./spa-tabs-utils";
import type { ManagedUser } from "@/src/services/userApi";

interface CreateUserForm {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface SpaTabUsuariosProps {
  users: ManagedUser[];
  createUserForm: CreateUserForm;
  setCreateUserForm: (form: CreateUserForm | ((prev: CreateUserForm) => CreateUserForm)) => void;
  isCreatingUser: boolean;
  updatingUserId: string | null;
  resendingActivationUserId: string | null;
  isLoadingUsers: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateUserRole: (userId: string, role: string) => void | Promise<void>;
  onResendActivationLink: (userId: string) => void | Promise<void>;
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

export function SpaTabUsuarios({
  users,
  createUserForm,
  setCreateUserForm,
  isCreatingUser,
  updatingUserId,
  resendingActivationUserId,
  isLoadingUsers,
  onSubmit,
  onUpdateUserRole,
  onResendActivationLink,
  onRefresh
}: SpaTabUsuariosProps) {
  const [selectedRoleByUser, setSelectedRoleByUser] = useState<Record<string, EditableRole>>({});

  useEffect(() => {
    const nextState: Record<string, EditableRole> = {};
    for (const managedUser of users) {
      nextState[managedUser.id] = normalizeEditableRole(managedUser.role);
    }
    setSelectedRoleByUser(nextState);
  }, [users]);

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2 }}
        >
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Gestion de usuarios
          </Typography>
          <Button variant="outlined" onClick={onRefresh} disabled={isLoadingUsers}>
            {isLoadingUsers ? "Actualizando..." : "Actualizar"}
          </Button>
        </Stack>

        <Box component="form" onSubmit={onSubmit} sx={{ mb: 2.5 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 1.5
            }}
          >
            <TextField
              label="Nombre"
              value={createUserForm.firstName}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
            />
            <TextField
              label="Apellido"
              value={createUserForm.lastName}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
            />
            <TextField
              label="Email"
              required
              type="email"
              value={createUserForm.email}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
            />
            <TextField
              label="Rol"
              select
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
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            El usuario se crea sin contrasena y recibe un enlace de activacion para definir su contrasena.
          </Typography>
          <Button sx={{ mt: 1.5 }} type="submit" variant="contained" disabled={isCreatingUser}>
            {isCreatingUser ? "Creando usuario..." : "Crear usuario y enviar enlace"}
          </Button>
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
          <Stack spacing={1.2}>
            {users.map((managedUser) => {
              const fullName =
                [managedUser.firstName, managedUser.lastName].filter(Boolean).join(" ") || "-";
              const currentRole = normalizeEditableRole(managedUser.role);
              const selectedRole = selectedRoleByUser[managedUser.id] ?? currentRole;
              const isUpdatingRole = updatingUserId === managedUser.id;
              const isResendingActivation = resendingActivationUserId === managedUser.id;
              const canSaveRole = !isUpdatingRole && selectedRole !== currentRole;
              const canResendActivation = !managedUser.emailVerified;

              return (
                <Paper key={managedUser.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", md: "center" }}
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {managedUser.email}
                      </Typography>
                      <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 0.6 }}>
                        <Chip size="small" variant="outlined" label={formatManagedUserRole(managedUser.role)} />
                        <Chip
                          size="small"
                          color={managedUser.emailVerified ? "success" : "warning"}
                          label={managedUser.emailVerified ? "Verificado" : "Sin verificar"}
                        />
                      </Stack>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Alta: {formatManagedUserDate(managedUser.createdAt)}
                    </Typography>
                  </Stack>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Nombre
                    </Typography>
                    <Typography variant="body2">{fullName}</Typography>
                  </Box>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    sx={{ mt: 1.2 }}
                  >
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
                      sx={{ minWidth: 220 }}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant="outlined"
                      disabled={!canSaveRole}
                      onClick={() => {
                        void onUpdateUserRole(managedUser.id, selectedRole);
                      }}
                    >
                      {isUpdatingRole ? "Guardando..." : "Guardar rol"}
                    </Button>
                    {canResendActivation ? (
                      <Button
                        variant="outlined"
                        color="secondary"
                        disabled={isResendingActivation}
                        onClick={() => {
                          void onResendActivationLink(managedUser.id);
                        }}
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
