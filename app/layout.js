import '../styles/globals.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import Providers from './providers';

export const metadata = {
  title: 'Is HPP Open',
  description:
    'A web app that shows current HPP water level, quality, slots and other paddling opportunities such as Trent Lock',
  openGraph: {
    title: 'Is HPP Open? - A quick checker for HPP and Trent water levels',
    description:
      'A web app that shows current HPP water level, quality, slots and other paddling opportunities such as Trent Lock',
    url: 'https://ishppopen.co.uk/',
    type: 'website',
    images: [
      {
        url: 'https://ishppopen.co.uk/HPP_cover.jpg',
      },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
