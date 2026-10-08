/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
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
