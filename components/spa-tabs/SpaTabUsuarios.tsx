"use client";

import { FormEvent } from "react";
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
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ marginTop: 0, marginBottom: 0 }}>Gestion de usuarios</h3>
        <button className="btn ghost" onClick={onRefresh} type="button" disabled={isLoadingUsers}>
          {isLoadingUsers ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 14, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label style={{ display: "block" }}>
            Nombre
            <input
              type="text"
              value={createUserForm.firstName}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
              placeholder="Nombre"
            />
          </label>
          <label style={{ display: "block" }}>
            Apellido
            <input
              type="text"
              value={createUserForm.lastName}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
              placeholder="Apellido"
            />
          </label>
          <label style={{ display: "block" }}>
            Email
            <input
              type="email"
              required
              value={createUserForm.email}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="usuario@dominio.com"
            />
          </label>
          <label style={{ display: "block" }}>
            Rol
            <select
              value={createUserForm.role}
              onChange={(e) => setCreateUserForm((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="DOCENTE">Docente</option>
              <option value="SOPORTE_ZOOM">Soporte Zoom</option>
              <option value="ASISTENTE_ZOOM">Asistente Zoom</option>
              <option value="CONTADURIA">Contaduria</option>
              <option value="ADMINISTRADOR">Administrador</option>
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          El usuario se crea sin contrasena y recibe un enlace magico para activar su acceso.
        </p>
        <div style={{ marginTop: 10 }}>
          <button className="btn primary" type="submit" disabled={isCreatingUser}>
            {isCreatingUser ? "Creando usuario..." : "Crear usuario y enviar enlace"}
          </button>
        </div>
      </form>

      {isLoadingUsers && <p className="muted">Cargando usuarios...</p>}
      {!isLoadingUsers && users.length === 0 && <p className="muted">No hay usuarios registrados.</p>}

      {!isLoadingUsers && users.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Verificado</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {users.map((managedUser) => (
              <tr key={managedUser.id}>
                <td>{managedUser.email}</td>
                <td>{[managedUser.firstName, managedUser.lastName].filter(Boolean).join(" ") || "-"}</td>
                <td>{formatManagedUserRole(managedUser.role)}</td>
                <td>{managedUser.emailVerified ? "Si" : "No"}</td>
                <td>{formatManagedUserDate(managedUser.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
