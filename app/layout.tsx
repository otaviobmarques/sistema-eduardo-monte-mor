import type { Metadata, Viewport } from 'next';
import { Inter, Nunito } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
const nunito = Nunito({ subsets: ['latin'], weight: ['300', '700', '800', '900'], variable: '--font-nunito' });

export const metadata: Metadata = {
  title: { default: 'Sistema de OS – Auto Visão', template: '%s · Sistema de OS – Auto Visão' },
  description: 'Ordens de serviço de vistoria veicular da Auto Visão Vistorias',
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
