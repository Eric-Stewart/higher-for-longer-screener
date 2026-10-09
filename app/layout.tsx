import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Higher for Longer | Small-Cap Screener",
  description: "Evidence-first small-cap quality and liquidity screener",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
