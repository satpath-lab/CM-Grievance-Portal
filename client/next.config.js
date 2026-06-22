/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disabled: this app has no <Image> usage and every page is a client
  // component (geolocation, EventSource, localStorage), so there's no
  // server-rendering benefit here. Turning this off avoids pulling in the
  // `sharp` native binary, which is unnecessary weight on free-tier hosts.
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api",
  },
};

module.exports = nextConfig;
