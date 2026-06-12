import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Assisted Will Maker',
  description: 'Draft your legal Last Will and Testament guided by an expert AI interview assistant.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-950">
        {children}
      </body>
    </html>
  );
}
