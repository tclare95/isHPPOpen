import NextAuth from 'next-auth'
import Auth0Provider from "next-auth/providers/auth0"

const authOptions  = {
  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_DOMAIN,
    })],
    secret: process.env.SECRET,
  
}

export default NextAuth(authOptions)

