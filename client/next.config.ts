import type { NextConfig } from 'next';

const WORKER_URL = process.env.ARROW_WORKER_URL ?? 'http://127.0.0.1:8787';

const nextConfig: NextConfig = {
  // The app is a live, client-rendered command center. Cache Components keeps
  // hidden routes mounted, which would keep WebGL globes alive between pages.
  cacheComponents: false,
  // react-globe.gl's kapsule wrapper does not survive StrictMode's dev-only
  // double mount (the globe renders blank), so StrictMode stays off.
  reactStrictMode: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  async rewrites() {
    // Analytics (Tiger) and agent health come from the thin worker service.
    return [{ source: '/api/worker/:path*', destination: `${WORKER_URL}/:path*` }];
  },
};

export default nextConfig;
