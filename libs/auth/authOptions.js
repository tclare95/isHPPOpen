import Auth0Provider from "next-auth/providers/auth0";
import { isAdminSubject } from "./adminAccess";

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
    // `token.sub` is the stable Auth0 subject. Admin access follows the same policy as
    // requireRouteAdmin() and is re-evaluated on every session read, so editing the optional
    // ADMIN_AUTH0_SUBS allowlist takes effect without waiting for sessions to expire.
    session({ session, token }) {
      const subject = typeof token?.sub === "string" ? token.sub : null;
      return {
        ...session,
        user: {
          ...session?.user,
          id: subject,
          isAdmin: isAdminSubject(subject),
        },
      };
    },
  },
};
