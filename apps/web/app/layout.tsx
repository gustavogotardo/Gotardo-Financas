import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';
import PwaRegister from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gotardo Finanças',
  description: 'Gerenciamento e planejamento financeiro familiar',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Gotardo',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon-512.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#3730a3',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
