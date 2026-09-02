import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NexusDAG — Visual Multi-Agent Workflow & Vector Engine",
  description:
    "Production directed acyclic graph execution engine with PostgreSQL pgvector retrieval, semantic condition routers, and real-time streaming telemetry.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-canvas text-ink min-h-screen selection:bg-surface-border selection:text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
