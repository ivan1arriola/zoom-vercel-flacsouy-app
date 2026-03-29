import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { env } from "./env";

const rolePriority: Record<UserRole, number> = {
  DOCENTE: 1,
  ASISTENTE_ZOOM: 2,
  SOPORTE_ZOOM: 2,
  CONTADURIA: 2,
  ADMINISTRADOR: 3
};

const ADMIN_VIEW_ROLE_COOKIE = "zoom_view_as";

function normalizeOperationalRole(role: UserRole): UserRole {
  return role === UserRole.SOPORTE_ZOOM ? UserRole.ASISTENTE_ZOOM : role;
}

function normalizeAdminViewRole(raw: string): UserRole | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === UserRole.ADMINISTRADOR) return UserRole.ADMINISTRADOR;
  if (normalized === UserRole.DOCENTE) return UserRole.DOCENTE;
  if (normalized === UserRole.CONTADURIA) return UserRole.CONTADURIA;
  return null;
}

async function getAdminViewRoleFromCookie(): Promise<UserRole | null> {
  try {
    const cookieStore = await cookies();
    const value = cookieStore.get(ADMIN_VIEW_ROLE_COOKIE)?.value ?? "";
    return normalizeAdminViewRole(value);
  } catch {
    return null;
  }
}

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user?.email || !user?.role) return null;

  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      role: true,
      firstName: true,
      lastName: true,
      name: true,
      image: true
    }
  });

  if (!dbUser || !dbUser.emailVerified) return null;

  const adminViewRole =
    dbUser.role === UserRole.ADMINISTRADOR ? await getAdminViewRoleFromCookie() : null;
  const effectiveRole = normalizeOperationalRole(adminViewRole ?? dbUser.role);

  return {
    id: dbUser.id,
    email: dbUser.email,
    role: effectiveRole,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    name: dbUser.name,
    image: dbUser.image
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
  return (
    rolePriority[normalizeOperationalRole(sessionRole)] >=
    rolePriority[normalizeOperationalRole(minRole)]
  );
}

export async function isAdminAuthorized(): Promise<boolean> {
  return isRoleAuthorized(UserRole.ADMINISTRADOR);
}

export async function isOperatorAuthorized(): Promise<boolean> {
  return isRoleAuthorized(UserRole.ASISTENTE_ZOOM);
}

export async function hasAnyRole(roles: UserRole[]): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  if (user.role === UserRole.ADMINISTRADOR) return true;
  return roles.map(normalizeOperationalRole).includes(normalizeOperationalRole(user.role));
}

export function isCronAuthorized(request: Request): boolean {
  if (!env.CRON_SECRET) return true;
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  return secret === env.CRON_SECRET;
}
