import type { Metadata } from 'next';
import { Geist, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans'
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600', '700']
});

export const metadata: Metadata = {
  title: 'LeakProof AI',
  description: 'Revenue leakage recovery workspace for contracts, invoices, and usage data.',
  icons: {
    icon: '/icon.svg'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${plexMono.variable}`}>{children}</body>
    </html>
  );
}
