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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg text-[#e6edf3] antialiased">
        {children}
      </body>
    </html>
  );
}
