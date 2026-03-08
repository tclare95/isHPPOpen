import Auth0Provider from "next-auth/providers/auth0";

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
};
