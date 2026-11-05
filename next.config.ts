import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '21mb' } },
  serverExternalPackages: ['@react-pdf/renderer'],
  // O PDF dos relatórios embute o logo oficial lido do disco
  outputFileTracingIncludes: { '/api/relatorios': ['./public/brand/logo-colorido.png'], '/api/fila': ['./public/brand/logo-colorido.png'] },
};

export default nextConfig;
