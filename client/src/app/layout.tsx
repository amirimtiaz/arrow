import type { Metadata } from 'next';
import { Anton, Inter, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { ArrowTransitionProvider } from '@/components/transition/arrow-transition';
import './globals.css';

// next/font self-hosts these at build time: no runtime font CDN.
const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-anton', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: 'Arrow — Agentic Supply Chain Intelligence',
  description:
    'Centralized, digitized and agentic supply chain intelligence: live operations, AI agents that investigate disruptions, and an isolated cyber incident command center.',
};

// Applies the saved theme before first paint so the page never flashes.
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('arrow-theme');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${anton.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>
        <Script id="arrow-theme" strategy="beforeInteractive">
          {THEME_BOOTSTRAP}
        </Script>
        <ArrowTransitionProvider>{children}</ArrowTransitionProvider>
      </body>
    </html>
  );
}
