/**
 * @project AncestorTree
 * @file src/app/layout.tsx
 * @description Root layout with providers (Auth, Tooltip, Toaster)
 * @version 2.0.0
 * @updated 2026-02-25
 */

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: 'Gia Phả Điện Tử - Họ Đinh làng Vĩnh Thượng',
    template: '%s | Gia Phả Họ Đinh',
  },
  description: 'Phần mềm quản lý gia phả điện tử cho Họ Đinh làng Vĩnh Thượng. Lưu trữ thông tin dòng họ, cây gia phả, lịch giỗ chạp.',
  keywords: ['gia phả', 'gia phả điện tử', 'Họ Đinh', 'làng Vĩnh Thượng', 'dòng họ', 'cây gia phả', 'phả hệ'],
  authors: [{ name: 'Họ Đinh làng Vĩnh Thượng' }],
  openGraph: {
    title: 'Gia Phả Điện Tử - Họ Đinh làng Vĩnh Thượng',
    description: 'Gìn giữ tinh hoa - Tiếp bước cha ông',
    type: 'website',
    locale: 'vi_VN',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          <AuthProvider>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
