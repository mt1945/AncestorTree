/**
 * @file src/app/(auth)/layout.tsx
 * @description Auth pages layout — adds the light/dark toggle (top-right)
 */

import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute right-4 top-4 z-50">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
