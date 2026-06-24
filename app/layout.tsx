import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Agent",
  description: "A proactive personal chief-of-staff agent.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-page font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
