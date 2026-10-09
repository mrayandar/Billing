import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticate } from "@/lib/auth-core";
import { db } from "@/lib/db";
import { IDLE_LOGOUT_MINUTES } from "@/lib/permission-keys";

// The session only remembers who the user is. Their role and permissions are read from
// the database on every request (see lib/session.ts), so changes apply immediately.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: IDLE_LOGOUT_MINUTES * 60, updateAge: 60 }, // idle logout (SE-07)
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(raw) {
        const result = await authenticate(db, String(raw?.username ?? ""), String(raw?.password ?? ""));
        return result.ok ? { id: String(result.userId) } : null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = Number(user.id);
      return token;
    },
    session({ session, token }) {
      (session.user as unknown as { id: number }).id = token.uid as number;
      return session;
    },
  },
});
