import type { NextConfig } from 'next';

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
};

export default nextConfig;
