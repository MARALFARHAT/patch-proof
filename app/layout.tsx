import type { Metadata } from "next";
import "./globals.css";

const description =
  "Research the current migration, repair the repository in isolation, and prove the fix with real tests.";
const publicOrigin =
  process.env.PATCHPROOF_PUBLIC_ORIGIN ??
  "https://patchproof.marallfarhat.chatgpt.site";
const socialImage = new URL("/og.png", publicOrigin).toString();

export const metadata: Metadata = {
  title: "PatchProof",
  description,
  openGraph: {
    title: "PatchProof — Don’t guess the fix. Prove it.",
    description,
    type: "website",
    images: [{ url: socialImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PatchProof — Don’t guess the fix. Prove it.",
    description,
    images: [socialImage],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
