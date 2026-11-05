import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '21mb' } },
  serverExternalPackages: ['@react-pdf/renderer'],
  // Os PDFs embutem o logo oficial lido do disco e usam as fontes padrão do pdfkit, carregadas dinamicamente
  // (o rastreamento de arquivos da Vercel não as encontra sozinho)
  outputFileTracingIncludes: {
    '/api/relatorios': ['./public/brand/logo-colorido.png', './node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
    '/api/fila': ['./public/brand/logo-colorido.png', './node_modules/pdfkit/js/standard-fonts/**', './node_modules/pdfkit/js/data/**'],
  },
};

export default nextConfig;
