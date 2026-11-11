/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
