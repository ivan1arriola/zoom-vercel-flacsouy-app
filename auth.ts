import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/src/lib/db";
import { asBoolean, authSecret, env } from "@/src/lib/env";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

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
            role: bootstrapUser.role
          };
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role
        };
      }
    })
  ],
  callbacks: {
    authorized({ auth, request }: { auth: { user?: unknown } | null; request: NextRequest }) {
      const pathname = request.nextUrl.pathname;
      const isAuthApi = pathname.startsWith("/api/auth");
      const isProtectedApi = pathname.startsWith("/api/v1");
      const isPublicAsset =
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname.startsWith("/manifest") ||
        pathname.startsWith("/icon");

      if (isAuthApi || isPublicAsset) return true;
      if (isProtectedApi) return Boolean(auth?.user);
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role?: UserRole }).role ?? UserRole.DOCENTE;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.userId ?? "");
        session.user.role = (token.role as UserRole | undefined) ?? UserRole.DOCENTE;
      }
      return session;
    }
  }
});
