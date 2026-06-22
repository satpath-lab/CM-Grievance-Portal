import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CM Grievance Dashboard — Delhi",
  description: "Chief Minister of Delhi Grievance and Complaint Management Portal",
  manifest: "/manifest.json",
  themeColor: "#1a237e",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
