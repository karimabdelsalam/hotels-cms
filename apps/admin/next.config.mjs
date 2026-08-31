/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@fantazia/db", "@fantazia/media"],
  serverExternalPackages: ["sharp"],
  webpack: (config, { isServer }) => {
    // sharp ships optional native packages that webpack cannot resolve at
    // build time. It is only ever used on the server, so keep it external.
    if (isServer) config.externals = [...(config.externals ?? []), "sharp"];
    return config;
  },
  // The admin is a separate deployment on its own hostname, so it can sit
  // behind an IP allowlist without affecting the public site, and none of its
  // bundle reaches guests.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
