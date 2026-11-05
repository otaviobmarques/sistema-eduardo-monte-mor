import type { NextConfig } from 'next';

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co';
const CSP = [
  "default-src 'self'",
  // Next.js injeta scripts inline de hidratação; sem eval
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} ${SUPABASE.replace('https://', 'wss://')}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const CABECALHOS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: CABECALHOS }];
  },
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
