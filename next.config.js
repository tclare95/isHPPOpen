/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/newforecast',
        destination: '/forecastinfo',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
