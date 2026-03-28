"use client";

import { FormEvent } from "react";
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
  isLoadingUsers: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
}

export function SpaTabUsuarios({
  users,
  createUserForm,
  setCreateUserForm,
  isCreatingUser,
  isLoadingUsers,
  onSubmit,
  onRefresh
}: SpaTabUsuariosProps) {
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
              <MenuItem value="DOCENTE">Docente</MenuItem>
              <MenuItem value="SOPORTE_ZOOM">Soporte Zoom</MenuItem>
              <MenuItem value="ASISTENTE_ZOOM">Asistente Zoom</MenuItem>
              <MenuItem value="CONTADURIA">Contaduria</MenuItem>
              <MenuItem value="ADMINISTRADOR">Administrador</MenuItem>
            </TextField>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            El usuario se crea sin contrasena y recibe un enlace magico para activar su acceso.
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
                </Paper>
              );
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
