import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n.ts");

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
  experimental: { optimizePackageImports: ["next-intl"] },
};

export default withNextIntl(nextConfig);
