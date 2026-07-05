import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { TaskDetailPanel } from "@/components/app/TaskDetailPanel";
import { Toaster } from "@/components/app/Toast";

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
        <Suspense fallback={null}>
          <TaskDetailPanel />
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
