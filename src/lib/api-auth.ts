import { UserRole } from "@prisma/client";
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

function normalizeOperationalRole(role: UserRole): UserRole {
  return role === UserRole.SOPORTE_ZOOM ? UserRole.ASISTENTE_ZOOM : role;
}

export type SessionUser = {
  id: string;
  email: string;
  emails: string[];
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
      image: true,
      emailAliases: {
        select: {
          email: true
        },
        orderBy: {
          email: "asc"
        }
      }
    }
  });

  if (!dbUser || !dbUser.emailVerified) return null;

  const effectiveRole = normalizeOperationalRole(dbUser.role);

  const emails = Array.from(
    new Set([
      dbUser.email.trim().toLowerCase(),
      ...dbUser.emailAliases.map((item) => item.email.trim().toLowerCase())
    ])
  );

  return {
    id: dbUser.id,
    email: dbUser.email,
    emails,
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
