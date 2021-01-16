import '../styles/globals.css'
import 'bootstrap/dist/css/bootstrap.min.css';
import TagManager from 'react-gtm-module'
import {useEffect} from 'react'

const tagManagerArgs = {
  gtmId: 'GTM-P4M975K'
}
function MyApp({ Component, pageProps }) {
  useEffect(() => {
    TagManager.initialize(tagManagerArgs)
  }, [])

  return <Component {...pageProps} />
}

export default MyApp
