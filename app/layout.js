import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "../styles/globals.css";
import PropTypes from "prop-types";
import Providers from "./providers";

export const metadata = {
  title: "Is HPP Open",
  description:
    "A web app that shows current HPP water level, quality, slots and other paddling opportunities such as Trent Lock",
  openGraph: {
    title: "Is HPP Open? - A quick checker for HPP and Trent water levels",
    description:
      "A web app that shows current HPP water level, quality, slots and other paddling opportunities such as Trent Lock",
    url: "https://ishppopen.co.uk/",
    type: "website",
    images: [
      {
        url: "https://ishppopen.co.uk/HPP_cover.jpg",
      },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

RootLayout.propTypes = {
  children: PropTypes.node.isRequired,
};
