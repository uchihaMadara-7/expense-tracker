import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
  title: "Expense Tracker",
  description: "Supabase-ready expense analytics and Excel import dashboard.",
};

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
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <div className="sticky top-0 z-20 flex h-12 items-center border-b bg-background/95 px-3 backdrop-blur">
                <SidebarTrigger />
              </div>
              {children}
            </SidebarInset>
            <Toaster richColors />
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
