import type { Metadata, Viewport } from 'next';
import { Inter, Nunito } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
const nunito = Nunito({ subsets: ['latin'], weight: ['300', '700', '800', '900'], variable: '--font-nunito' });

const DESCRICAO = 'Ordens de serviço de vistoria veicular da Auto Visão: SLA de 48h, frustrações, laudo em PDF e pagamento por placa. Tudo rastreável.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'https://auto-visao-os.vercel.app'),
  title: { default: 'Sistema de OS – Auto Visão', template: '%s · Sistema de OS – Auto Visão' },
  description: DESCRICAO,
  applicationName: 'Sistema de OS – Auto Visão',
  // Pré-visualização de link (WhatsApp, LinkedIn, Facebook, X): imagens em app/opengraph-image.png e app/twitter-image.png
  openGraph: { type: 'website', locale: 'pt_BR', siteName: 'Sistema de OS – Auto Visão', title: 'Sistema de OS – Auto Visão', description: DESCRICAO, url: '/' },
  twitter: { card: 'summary_large_image', title: 'Sistema de OS – Auto Visão', description: DESCRICAO },
  manifest: '/manifest.webmanifest',
  icons: { apple: '/apple-touch-icon.png' },
};

export const viewport: Viewport = { themeColor: '#ED3237', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${nunito.variable}`}>
      <body className="min-h-screen font-body antialiased">{children}</body>
    </html>
  );
}
