import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: "owner" | "employee" | "tester";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "owner" | "employee" | "tester";
    /** Private beta: tester session version (revocation). */
    sv?: number;
  }
}
