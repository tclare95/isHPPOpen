/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
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
