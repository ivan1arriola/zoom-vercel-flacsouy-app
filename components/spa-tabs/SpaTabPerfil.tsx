"use client";

import { FormEvent } from "react";
import { UserAvatar } from "@/components/user-avatar";
import type { CurrentUser } from "@/components/spa-home";

interface ProfileForm {
  firstName: string;
  lastName: string;
  image: string;
}

interface SpaTabPerfilProps {
  user: CurrentUser | null;
  showProfileForm: boolean;
  setShowProfileForm: (show: boolean) => void;
  profileForm: ProfileForm;
  setProfileForm: (form: ProfileForm) => void;
  googleLinked: boolean;
  hasPassword: boolean;
  isLoadingGoogleStatus: boolean;
  isSyncingGoogleProfile: boolean;
  isUnlinkingGoogleAccount: boolean;
  isUpdatingProfile: boolean;
  canUseGoogleByEmail: boolean;
  onLinkGoogleAccount: () => void;
  onUnlinkGoogleAccount: () => void;
  onSyncProfileFromGoogle: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SpaTabPerfil({
  user,
  showProfileForm,
  setShowProfileForm,
  profileForm,
  setProfileForm,
  googleLinked,
  hasPassword,
  isLoadingGoogleStatus,
  isSyncingGoogleProfile,
  isUnlinkingGoogleAccount,
  isUpdatingProfile,
  canUseGoogleByEmail,
  onLinkGoogleAccount,
  onUnlinkGoogleAccount,
  onSyncProfileFromGoogle,
  onSubmit
}: SpaTabPerfilProps) {
  if (!user) return null;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
      <article className="card" style={{ width: "min(100%, 720px)" }}>
        <h3 style={{ marginTop: 0 }}>Mi perfil</h3>
        {!showProfileForm ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p>
                <strong>Nombre:</strong> {user.firstName || "-"}
              </p>
              <p>
                <strong>Apellido:</strong> {user.lastName || "-"}
              </p>
              <p>
                <strong>Email:</strong> {user.email}
              </p>
              <p style={{ marginTop: 12, marginBottom: 8 }}>
                <strong>Foto de perfil:</strong>
              </p>
              <div style={{ marginTop: 8 }}>
                <UserAvatar
                  firstName={user.firstName}
                  lastName={user.lastName}
                  image={user.image}
                  size={100}
                />
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <h4 style={{ marginTop: 0, marginBottom: 8 }}>Cuenta de Google</h4>
              {!canUseGoogleByEmail ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  Google solo esta habilitado para cuentas @flacso.edu.uy.
                </p>
              ) : isLoadingGoogleStatus ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  Cargando estado de vinculacion...
                </p>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Estado: {googleLinked ? "Vinculada" : "No vinculada"}
                  </p>
                  {!hasPassword && (
                    <p className="muted" style={{ marginTop: 0 }}>
                      Aviso: para desvincular Google debes tener contrasena establecida.
                    </p>
                  )}
                </>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={onLinkGoogleAccount}
                  disabled={!canUseGoogleByEmail}
                >
                  Vincular Google
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={onUnlinkGoogleAccount}
                  disabled={!canUseGoogleByEmail || !googleLinked || !hasPassword || isUnlinkingGoogleAccount}
                >
                  {isUnlinkingGoogleAccount ? "Desvinculando..." : "Desvincular Google"}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={onSyncProfileFromGoogle}
                  disabled={!canUseGoogleByEmail || !googleLinked || isSyncingGoogleProfile}
                >
                  {isSyncingGoogleProfile ? "Sincronizando..." : "Volver a sincronizar con Google"}
                </button>
              </div>
            </div>
            <button className="btn primary" onClick={() => setShowProfileForm(true)} type="button">
              Editar perfil
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <label style={{ display: "block", marginBottom: 8 }}>
              Nombre
              <input
                type="text"
                value={profileForm.firstName}
                onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                placeholder="Tu nombre"
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              Apellido
              <input
                type="text"
                value={profileForm.lastName}
                onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                placeholder="Tu apellido"
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              URL de foto de perfil
              <input
                type="url"
                value={profileForm.image}
                onChange={(e) => setProfileForm({ ...profileForm, image: e.target.value })}
                placeholder="https://ejemplo.com/foto.jpg"
              />
            </label>
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: 0, marginBottom: 8 }}>Vista previa:</p>
              <UserAvatar
                firstName={profileForm.firstName}
                lastName={profileForm.lastName}
                image={profileForm.image}
                size={100}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" type="submit" disabled={isUpdatingProfile}>
                {isUpdatingProfile ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setShowProfileForm(false);
                  setProfileForm({
                    firstName: user.firstName ?? "",
                    lastName: user.lastName ?? "",
                    image: user.image ?? ""
                  });
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </article>
    </div>
  );
}
