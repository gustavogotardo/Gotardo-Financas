import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gotardo Finanças',
    short_name: 'Gotardo',
    description: 'Gerenciamento e planejamento financeiro familiar',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0b1020',
    theme_color: '#3730a3',
    lang: 'pt-BR',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
