"use client";

import { FormEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography
} from "@mui/material";
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
    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
      <Card variant="outlined" sx={{ width: "min(100%, 760px)", borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Mi perfil
          </Typography>

          {!showProfileForm ? (
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    Nombre:
                  </Box>{" "}
                  {user.firstName || "-"}
                </Typography>
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    Apellido:
                  </Box>{" "}
                  {user.lastName || "-"}
                </Typography>
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    Email:
                  </Box>{" "}
                  {user.email}
                </Typography>
              </Stack>

              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Foto de perfil
                </Typography>
                <UserAvatar firstName={user.firstName} lastName={user.lastName} image={user.image} size={100} />
              </Box>

              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Cuenta de Google
                </Typography>
                {!canUseGoogleByEmail ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Google solo esta habilitado para cuentas @flacso.edu.uy.
                  </Typography>
                ) : isLoadingGoogleStatus ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Cargando estado de vinculacion...
                  </Typography>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Estado: {googleLinked ? "Vinculada" : "No vinculada"}
                    </Typography>
                    {!hasPassword && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        Aviso: para desvincular Google debes tener contrasena establecida.
                      </Typography>
                    )}
                  </>
                )}

                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Button variant="outlined" onClick={onLinkGoogleAccount} disabled={!canUseGoogleByEmail}>
                    Vincular Google
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={onUnlinkGoogleAccount}
                    disabled={!canUseGoogleByEmail || !googleLinked || !hasPassword || isUnlinkingGoogleAccount}
                  >
                    {isUnlinkingGoogleAccount ? "Desvinculando..." : "Desvincular Google"}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={onSyncProfileFromGoogle}
                    disabled={!canUseGoogleByEmail || !googleLinked || isSyncingGoogleProfile}
                  >
                    {isSyncingGoogleProfile ? "Sincronizando..." : "Volver a sincronizar"}
                  </Button>
                </Stack>
              </Box>

              <Button variant="contained" onClick={() => setShowProfileForm(true)}>
                Editar perfil
              </Button>
            </Stack>
          ) : (
            <Box component="form" onSubmit={onSubmit}>
              <Stack spacing={1.5}>
                <TextField
                  label="Nombre"
                  value={profileForm.firstName}
                  onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                />
                <TextField
                  label="Apellido"
                  value={profileForm.lastName}
                  onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                />
                <TextField
                  label="URL de foto de perfil"
                  type="url"
                  value={profileForm.image}
                  onChange={(e) => setProfileForm({ ...profileForm, image: e.target.value })}
                />

                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Vista previa
                  </Typography>
                  <UserAvatar
                    firstName={profileForm.firstName}
                    lastName={profileForm.lastName}
                    image={profileForm.image}
                    size={100}
                  />
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button type="submit" variant="contained" disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? "Guardando..." : "Guardar cambios"}
                  </Button>
                  <Button
                    variant="outlined"
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
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
