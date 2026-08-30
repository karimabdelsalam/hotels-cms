import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@fantazia/db"],
  experimental: { optimizePackageImports: ["next-intl"] },
};

export default withNextIntl(nextConfig);
