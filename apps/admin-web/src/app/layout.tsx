import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'SAMKRUSHI Admin', template: '%s · SAMKRUSHI Admin' },
  description: 'SAMKRUSHI operations dashboard for authorized staff.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
