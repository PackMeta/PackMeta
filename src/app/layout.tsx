import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://packmeta.app"),
  title: {
    default: "PackMeta — Should you rip it?",
    template: "%s | PackMeta",
  },
  description:
    "See the expected value of every TCG pack, box, and bundle. Lorcana, One Piece, Pokémon and more. Updated daily.",
  openGraph: {
    title: "PackMeta — Should you rip it?",
    description:
      "See the expected value of every TCG pack, box, and bundle. Lorcana, One Piece, Pokémon and more. Updated daily.",
    url: "https://packmeta.app",
    siteName: "PackMeta",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PackMeta — Should you rip it?",
    description:
      "See the expected value of every TCG pack, box, and bundle. Lorcana, One Piece, Pokémon and more. Updated daily.",
  },
  robots: { index: true, follow: true },
  
  verification: {
  google: "u8SGir8Mmx0qyViEpt0_HtvUMFbNpCGbKfzLxriYP6A",
  other: {
    "impact-site-verification": "447ce371-818b-4828-b8a2-92d2beb58137",
  },
},

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
