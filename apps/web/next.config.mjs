/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Em dev o navegador acessa /api/v1 no mesmo origin da web (:3001) e o
    // Next redireciona para a API (:3000). Em produção o Caddy já roteia.
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
