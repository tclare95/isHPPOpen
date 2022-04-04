import Head from 'next/head'


export default function Meta ({title, content}) {
    return (
        <Head>
            <title>{title}</title>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
            <meta
            name="description"
            content="A web app that shows current HPP water level, quality, slots and other paddling opportunities such as Trent Lock"
            />
            <meta property="og:title"              content="Is HPP Open? - A quick checker for HPP and Trent water levels" />
            <meta property="og:description"        content="A web app that shows current HPP water level, quality, slots and other paddling opportunities such as Trent Lock" />
            <meta property="og:url"                content="https://ishppopen.co.uk/" />
            <meta property="og:type"               content="website" />
            <meta property="og:image"              content="https://ishppopen.co.uk/HPP_cover.jpg" />
    
            
  
      </Head>
    )
}