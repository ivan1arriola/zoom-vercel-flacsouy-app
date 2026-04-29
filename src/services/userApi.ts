export type CurrentUser = {
  id: string;
  email: string;
  emails?: string[];
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
};

export type ManagedUser = {
  id: string;
  email: string;
  emails?: string[];
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  emailVerified?: string | null;
  createdAt: string;
};

export async function loadUsers(): Promise<ManagedUser[] | null> {
  const res = await fetch("/api/v1/usuarios", { cache: "no-store" });
  const json = (await res.json()) as { users?: ManagedUser[]; error?: string };
  if (!res.ok) {
    return null;
  }
  return json.users ?? [];
}

export async function submitCreateUser(payload: Record<string, unknown>): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo crear el usuario."
    };
  }

  return { success: true };
}

export async function submitUpdateUserRole(payload: {
  userId: string;
  role: string;
  emails?: string[];
}): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/usuarios", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo actualizar el usuario."
    };
  }

  return { success: true };
}

export async function submitResendUserActivationLink(payload: {
  userId: string;
}): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/usuarios/activation-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo reenviar el enlace de activacion."
    };
  }

  return { success: true };
}

export async function submitSendSelfActivationLinkTest(): Promise<{
  success: boolean;
  activationUrl?: string;
  error?: string;
}> {
  const response = await fetch("/api/v1/usuarios/activation-link/self", {
    method: "POST"
  });

  const data = (await response.json()) as { error?: string; activationUrl?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo enviar el enlace de prueba."
    };
  }

  return {
    success: true,
    activationUrl: data.activationUrl
  };
}

export async function loadGoogleAccountStatus(): Promise<{
  linked: boolean;
  hasPassword: boolean;
  canUseGoogle: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/auth/accounts/google", { cache: "no-store" });
  const data = (await response.json()) as {
    error?: string;
    accounts?: Array<{ provider: string }>;
    hasPassword?: boolean;
    canUseGoogle?: boolean;
  };
  if (!response.ok) {
    return {
      linked: false,
      hasPassword: false,
      canUseGoogle: false,
      error: data.error ?? "No se pudo obtener el estado de Google."
    };
  }

  const linked = Boolean(data.accounts?.some((account) => account.provider === "google"));
  return {
    linked,
    hasPassword: Boolean(data.hasPassword),
    canUseGoogle: Boolean(data.canUseGoogle),
    error: undefined
  };
}

export async function unlinkGoogleAccount(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const response = await fetch("/api/v1/auth/accounts/google", {
    method: "DELETE"
  });
  const data = (await response.json()) as { ok?: boolean; error?: string; message?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo desvincular la cuenta de Google."
    };
  }
  return {
    success: true,
    message: data.message ?? "Cuenta de Google desvinculada."
  };
}

export async function syncProfileFromGoogle(): Promise<{
  success: boolean;
  user?: CurrentUser;
  message?: string;
  error?: string;
}> {
  const response = await fetch("/api/v1/auth/accounts/google", {
    method: "POST"
  });
  const data = (await response.json()) as {
    ok?: boolean;
    error?: string;
    message?: string;
    user?: CurrentUser;
  };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo sincronizar el perfil con Google."
    };
  }
  return {
    success: true,
    user: data.user,
    message: data.message ?? "Perfil sincronizado con Google."
  };
}

export async function updateProfile(payload: Record<string, unknown>): Promise<{
  success: boolean;
  user?: CurrentUser;
  error?: string;
}> {
  const response = await fetch("/api/v1/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { error?: string; user?: CurrentUser };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo actualizar el perfil."
    };
  }
  return {
    success: true,
    user: data.user
  };
}
export async function updatePassword(password: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch("/api/v1/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return {
      success: false,
      error: data.error ?? "No se pudo actualizar la contrasena."
    };
  }
  return { success: true };
}
