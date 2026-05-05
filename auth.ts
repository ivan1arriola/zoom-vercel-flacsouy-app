export const runtime = "nodejs";

import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { db } from "@/src/lib/db";
import { asBoolean, authSecret, env } from "@/src/lib/env";
import { createAdminLoginNotifications } from "@/src/modules/notificaciones/service";

const ADMIN_EMAIL = "web@flacso.edu.uy";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

type AuthUserRecord = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  passwordHash: string | null;
  emailVerified: Date | null;
};

async function findUserByLoginEmail(email: string): Promise<AuthUserRecord | null> {
  const primary = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      firstName: true,
      lastName: true,
      passwordHash: true,
      emailVerified: true
    }
  });
  if (primary) return primary;

  const alias = await db.userEmailAlias.findUnique({
    where: { email },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          emailVerified: true
        }
      }
    }
  });

  return alias?.user ?? null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function ensureUserAliasEmail(userId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;

  const owner = await db.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });
  if (!owner) return;
  if (owner.email.trim().toLowerCase() === normalized) return;

  const conflictPrimary = await db.user.findFirst({
    where: {
      email: normalized,
      id: { not: userId }
    },
    select: { id: true }
  });
  if (conflictPrimary) return;

  await db.userEmailAlias.upsert({
    where: { email: normalized },
    create: {
      userId,
      email: normalized
    },
    update: {
      userId
    }
  });
}

async function resolveRequestMetadata(): Promise<{ userAgent: string | null; ip: string | null }> {
  try {
    const requestHeaders = await headers();
    const userAgent = requestHeaders.get("user-agent");
    const forwardedFor = requestHeaders.get("x-forwarded-for");
    const realIp = requestHeaders.get("x-real-ip");
    const cfIp = requestHeaders.get("cf-connecting-ip");
    const firstForwardedIp = forwardedFor?.split(",").map((item) => item.trim()).find(Boolean) ?? null;
    const ip = firstForwardedIp ?? realIp ?? cfIp ?? null;

    return { userAgent, ip };
  } catch {
    return { userAgent: null, ip: null };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db) as Adapter,
  secret: authSecret,
  trustHost: asBoolean(env.AUTH_TRUST_HOST, true),
  session: {
    strategy: "jwt"
  },
  providers: [
    Credentials({
      name: "Email y password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(rawCredentials) {
        const parsed = signInSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;

        if (
          env.AUTH_BOOTSTRAP_EMAIL &&
          env.AUTH_BOOTSTRAP_PASSWORD &&
          email === env.AUTH_BOOTSTRAP_EMAIL.trim().toLowerCase() &&
          password === env.AUTH_BOOTSTRAP_PASSWORD
        ) {
          const hash = await bcrypt.hash(password, 12);
          const bootstrapUser = await db.user.upsert({
            where: { email },
            create: {
              email,
              name: "Administrador",
              role: UserRole.ADMINISTRADOR,
              passwordHash: hash,
              emailVerified: new Date()
            },
            update: {
              role: UserRole.ADMINISTRADOR,
              passwordHash: hash,
              emailVerified: new Date()
            }
          });

          return {
            id: bootstrapUser.id,
            email: bootstrapUser.email,
            name: bootstrapUser.name,
            image: bootstrapUser.image,
            role: bootstrapUser.role,
            firstName: bootstrapUser.firstName,
            lastName: bootstrapUser.lastName
          };
        }

        const user = await findUserByLoginEmail(email);
        if (!user || !user.passwordHash) return null;
        if (!user.emailVerified) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return null;

        if (user.email === ADMIN_EMAIL && user.role !== UserRole.ADMINISTRADOR) {
          await db.user.update({
            where: { id: user.id },
            data: { role: UserRole.ADMINISTRADOR }
          });
        }

        const effectiveRole = user.email === ADMIN_EMAIL ? UserRole.ADMINISTRADOR : user.role;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: effectiveRole,
          firstName: user.firstName,
          lastName: user.lastName
        };
      }
    }),
    ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true
          })
        ]
      : [])
  ],
  callbacks: {
    authorized({ auth, request }: { auth: { user?: unknown } | null; request: NextRequest }) {
      const pathname = request.nextUrl.pathname;
      const isAuthApi = pathname.startsWith("/api/auth");
      const isProtectedApi = pathname.startsWith("/api/v1");
      const isPublicRegisterApi =
        pathname === "/api/v1/auth/register/initiate" ||
        pathname === "/api/v1/auth/register/verify";
      const isPublicRecoveryApi =
        pathname === "/api/v1/auth/password-recovery/request" ||
        pathname === "/api/v1/auth/password-recovery/confirm";
      const isPublicAsset =
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.startsWith("/manifest") ||
        pathname.startsWith("/icon");

      if (isAuthApi || isPublicAsset) return true;
      if (isProtectedApi && !isPublicRegisterApi && !isPublicRecoveryApi) return Boolean(auth?.user);
      return true;
    },
    async signIn({ user, account, profile }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      if (email === ADMIN_EMAIL) {
        await db.user.upsert({
          where: { email },
          create: {
            email,
            name: user.name ?? "Administrador",
            image: user.image,
            role: UserRole.ADMINISTRADOR,
            emailVerified: new Date()
          },
          update: { role: UserRole.ADMINISTRADOR }
        });
      }

      if (account?.provider !== "google") return true;

      const googleProfile = profile as {
        email_verified?: boolean;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
      } | undefined;
      if (!googleProfile?.email_verified) return false;

      const role = email === ADMIN_EMAIL ? UserRole.ADMINISTRADOR : UserRole.DOCENTE;
      const firstName = googleProfile.given_name;
      const lastName = googleProfile.family_name;
      const fullName = googleProfile.name ?? user.name;
      const image = googleProfile.picture ?? user.image;
      const aliasOwner = await db.userEmailAlias.findUnique({
        where: { email },
        select: {
          user: {
            select: {
              id: true,
              email: true,
              role: true
            }
          }
        }
      });
      const matchedUser =
        aliasOwner?.user && aliasOwner.user.id !== user.id
          ? await db.user.findUnique({
              where: { id: aliasOwner.user.id },
              select: {
                id: true,
                email: true,
                name: true,
                image: true,
                role: true,
                firstName: true,
                lastName: true,
                passwordHash: true,
                emailVerified: true
              }
            })
          : await findUserByLoginEmail(email);
      const targetUser =
        matchedUser
          ? await db.user.update({
              where: { id: matchedUser.id },
              data: {
                role: matchedUser.email === ADMIN_EMAIL ? UserRole.ADMINISTRADOR : matchedUser.role,
                firstName: firstName ?? undefined,
                lastName: lastName ?? undefined,
                name: fullName ?? undefined,
                image: image ?? undefined,
                emailVerified: new Date()
              },
              select: {
                id: true,
                email: true
              }
            })
          : await db.user.create({
              data: {
                email,
                firstName: firstName ?? undefined,
                lastName: lastName ?? undefined,
                name: fullName,
                image,
                role,
                emailVerified: new Date()
              },
              select: {
                id: true,
                email: true
              }
            });

      await ensureUserAliasEmail(targetUser.id, email);

      const providerAccountId = toNullableString(account.providerAccountId);
      if (providerAccountId) {
        await db.account.upsert({
          where: {
            provider_providerAccountId: {
              provider: "google",
              providerAccountId
            }
          },
          create: {
            userId: targetUser.id,
            type: account.type,
            provider: "google",
            providerAccountId,
            refresh_token: toNullableString(account.refresh_token),
            access_token: toNullableString(account.access_token),
            expires_at: toNullableNumber(account.expires_at),
            token_type: toNullableString(account.token_type),
            scope: toNullableString(account.scope),
            id_token: toNullableString(account.id_token),
            session_state: toNullableString(account.session_state)
          },
          update: {
            userId: targetUser.id,
            refresh_token: toNullableString(account.refresh_token),
            access_token: toNullableString(account.access_token),
            expires_at: toNullableNumber(account.expires_at),
            token_type: toNullableString(account.token_type),
            scope: toNullableString(account.scope),
            id_token: toNullableString(account.id_token),
            session_state: toNullableString(account.session_state)
          }
        });
      }

      if (user.id && user.id !== targetUser.id) {
        await db.user.delete({ where: { id: user.id } }).catch(() => undefined);
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const signInEmail = String((user as { email?: string | null }).email ?? token.email ?? "")
          .trim()
          .toLowerCase();
        const canonicalUser = signInEmail ? await findUserByLoginEmail(signInEmail) : null;

        token.userId = canonicalUser?.id ?? user.id;
        token.role =
          canonicalUser?.email === ADMIN_EMAIL || signInEmail === ADMIN_EMAIL
            ? UserRole.ADMINISTRADOR
            : canonicalUser?.role ?? (user as { role?: UserRole }).role ?? UserRole.DOCENTE;
        token.firstName =
          canonicalUser?.firstName ?? (user as { firstName?: string | null }).firstName;
        token.lastName =
          canonicalUser?.lastName ?? (user as { lastName?: string | null }).lastName;
      }

      if (String(token.email ?? "").trim().toLowerCase() === ADMIN_EMAIL) {
        token.role = UserRole.ADMINISTRADOR;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String((token.userId as unknown) ?? "");
        session.user.role = ((token.role as unknown) as UserRole | undefined) ?? UserRole.DOCENTE;
        session.user.firstName = (token as any).firstName;
        session.user.lastName = (token as any).lastName;
      }
      return session;
    }
  },
  events: {
    async signIn({ user, account }) {
      try {
        const email = String(user.email ?? "").trim().toLowerCase();
        if (!email) return;

        const canonical = await findUserByLoginEmail(email);
        const fallbackId = String((user as { id?: string | null }).id ?? "").trim();
        const userId = canonical?.id ?? fallbackId;
        if (!userId) return;

        const { userAgent, ip } = await resolveRequestMetadata();

        await createAdminLoginNotifications({
          userId,
          userEmail: email,
          userName: canonical?.name ?? user.name,
          provider: account?.provider ?? null,
          connectedAt: new Date(),
          userAgent,
          ip
        });
      } catch (error) {
        console.error("No se pudo crear la notificacion interna de login.", error);
      }
    }
  }
});
