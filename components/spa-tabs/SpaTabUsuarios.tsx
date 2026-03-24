"use client";

import { FormEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Paper
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
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Rol</TableCell>
                  <TableCell>Verificado</TableCell>
                  <TableCell>Creado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((managedUser) => (
                  <TableRow key={managedUser.id} hover>
                    <TableCell>{managedUser.email}</TableCell>
                    <TableCell>
                      {[managedUser.firstName, managedUser.lastName].filter(Boolean).join(" ") || "-"}
                    </TableCell>
                    <TableCell>{formatManagedUserRole(managedUser.role)}</TableCell>
                    <TableCell>{managedUser.emailVerified ? "Si" : "No"}</TableCell>
                    <TableCell>{formatManagedUserDate(managedUser.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
