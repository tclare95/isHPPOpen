import Auth0Provider from "next-auth/providers/auth0";
import { getAdminAccess, ADMIN_ACCESS } from "./adminAccess";

const nextAuthSecret = process.env.NEXTAUTH_SECRET;
const legacySecret = process.env.SECRET;

export const authOptions = {
  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_DOMAIN,
    }),
  ],
  // NEXTAUTH_SECRET is the standard variable name for next-auth.
  // SECRET remains a temporary legacy fallback for existing deployments
  // and should be removed after environments have migrated.
  secret: nextAuthSecret ?? legacySecret,
  callbacks: {
    // `token.sub` is the stable Auth0 subject. Admin access is re-evaluated against the current
    // ADMIN_AUTH0_SUBS allowlist on every session read, so removing an entry revokes access
    // without waiting for the session to expire. Server routes re-check via requireRouteAdmin().
    session({ session, token }) {
      const subject = typeof token?.sub === "string" ? token.sub : null;
      const adminAccess = getAdminAccess(subject);
      return {
        ...session,
        user: {
          ...session?.user,
          id: subject,
          isAdmin: adminAccess === ADMIN_ACCESS.GRANTED,
          adminAccess,
        },
      };
    },
  },
};
