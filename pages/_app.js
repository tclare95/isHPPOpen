import '../styles/globals.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import TagManager from 'react-gtm-module'
import {useEffect} from 'react'
import { SessionProvider } from "next-auth/react"
import { Analytics } from '@vercel/analytics/react';


const tagManagerArgs = {
  gtmId: 'GTM-P4M975K'
}
function MyApp({ Component, pageProps }) {
  useEffect(() => {
    TagManager.initialize(tagManagerArgs)
  }, [])

  return (
    <SessionProvider session={pageProps.session} refetchInterval={5 * 60}>
        <Component {...pageProps} />
        <Analytics />
    </SessionProvider>
  )
}

export default MyApp
