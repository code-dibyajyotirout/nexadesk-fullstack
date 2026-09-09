import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL('https://nexadesk.io'),
  title: "NexaDesk",
  description: "A high-performance touchless 2D window manager running entirely in-browser, powered by MediaPipe hand landmark tracking and CSS Glassmorphism. Build fullstack Next.js and Node.js applications with local AI.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "NexaDesk — Browser-Native Spatial Workspace",
    description: "A high-performance touchless 2D window manager running entirely in-browser. Build fullstack Next.js and Node.js applications using webcams, MediaPipe gesture tracking, and built-in AI code assistants.",
    type: "website",
    url: "https://nexadesk.io",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 675,
        alt: "NexaDesk OS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NexaDesk — Browser-Native Spatial Workspace",
    description: "A high-performance touchless 2D window manager running entirely in-browser. Build fullstack Next.js and Node.js applications using webcams, MediaPipe gesture tracking, and built-in AI code assistants.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Orbitron:wght@500;700;900&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet" />
        
        {/* MediaPipe Dependencies */}
        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossOrigin="anonymous" defer></script>
        <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js" crossOrigin="anonymous" defer></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
