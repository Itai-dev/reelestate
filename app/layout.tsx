import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import SiteNav from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "Reel Estate — מתמונות של נכס לסרטון",
  description: "מעלים תמונות של נכס ומקבלים סרטון שמראה את החלל, עם תנועת מצלמה, אור ומיתוג.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&family=Frank+Ruhl+Libre:wght@400;500;700&family=Bellefair&display=swap"
        />
      </head>
      <body>
        <SiteNav />
        {children}
        <footer className="site-foot">
          <span dir="ltr">Reel Estate</span>
          <Link href="/pricing">מחירים</Link>
          <Link href="/terms">תנאי שימוש</Link>
          <Link href="/privacy">פרטיות</Link>
        </footer>
      </body>
    </html>
  );
}
