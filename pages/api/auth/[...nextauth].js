import NextAuth from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";

export const authOptions = {
  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_DOMAIN,
    }),
  ],
  // NEXTAUTH_SECRET is the standard variable name for next-auth;
  // keep SECRET as a fallback to preserve existing deployments.
  secret: process.env.NEXTAUTH_SECRET ?? process.env.SECRET,
};

export default NextAuth(authOptions);
