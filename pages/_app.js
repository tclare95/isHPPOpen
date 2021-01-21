import '../styles/globals.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import TagManager from 'react-gtm-module'
import {useEffect} from 'react'
import { Provider } from 'next-auth/client'

const tagManagerArgs = {
  gtmId: 'GTM-P4M975K'
}
function MyApp({ Component, pageProps }) {
  useEffect(() => {
    TagManager.initialize(tagManagerArgs)
  }, [])

  return (
    <Provider session={pageProps.session}>
        <Component {...pageProps} />
    </Provider>
  )
}

export default MyApp
