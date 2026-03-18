import { UserRole } from "@prisma/client";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      firstName?: string | null;
      lastName?: string | null;
    };
  }

  interface User {
    role?: UserRole;
    firstName?: string | null;
    lastName?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    firstName?: string | null;
    lastName?: string | null;
  }
}
