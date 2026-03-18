import { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { env } from "./env";

const rolePriority: Record<UserRole, number> = {
  DOCENTE: 1,
  ASISTENTE_ZOOM: 2,
  SOPORTE_ZOOM: 2,
  CONTADURIA: 2,
  ADMINISTRADOR: 3
};

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user?.email || !user?.role) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function isRoleAuthorized(minRole: UserRole): Promise<boolean> {
  const user = await getSessionUser();
  const sessionRole = user?.role;
  if (!sessionRole) return false;
  return rolePriority[sessionRole] >= rolePriority[minRole];
}

export async function isAdminAuthorized(): Promise<boolean> {
  return isRoleAuthorized(UserRole.ADMINISTRADOR);
}

export async function isOperatorAuthorized(): Promise<boolean> {
  return isRoleAuthorized(UserRole.SOPORTE_ZOOM);
}

export async function hasAnyRole(roles: UserRole[]): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  if (user.role === UserRole.ADMINISTRADOR) return true;
  return roles.includes(user.role);
}

export function isCronAuthorized(request: Request): boolean {
  if (!env.CRON_SECRET) return true;
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  return secret === env.CRON_SECRET;
}
