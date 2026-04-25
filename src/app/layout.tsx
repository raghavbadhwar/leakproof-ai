import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LeakProof AI',
  description: 'Revenue leakage recovery workspace for contracts, invoices, and usage data.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
