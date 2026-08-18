import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gotardo Finanças',
  description: 'Gerenciamento e planejamento financeiro familiar',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
