import NextAuth from 'next-auth'
import Auth0Provider from "next-auth/providers/auth0"

const options = {
  providers: [
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_DOMAIN,
    })],
  
}

export default (req, res) => NextAuth(req, res, options)