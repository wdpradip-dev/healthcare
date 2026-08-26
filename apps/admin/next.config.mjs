/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are consumed as TS source (see docs/12-MONOREPO-STRUCTURE.md),
  // so Next needs to transpile them rather than expect pre-built JS.
  transpilePackages: [
    "@hospital/types",
    "@hospital/validation",
    "@hospital/ui-web",
    "@hospital/ui-tokens",
  ],
};

export default nextConfig;
