import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DropLink",
  description: "Finite merch drops for verified domains.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
