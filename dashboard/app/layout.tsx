import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "claude-fuse",
  description: "Local observability for Claude Code sessions",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <nav className="w-48 shrink-0 border-r border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-1">
            <div className="font-mono font-bold text-base mb-4 text-blue-600 dark:text-blue-400">
              claude-fuse
            </div>
            <NavLink href="/">Sessions</NavLink>
            <NavLink href="/mistakes">Mistakes</NavLink>
            <NavLink href="/skills">Skills</NavLink>
          </nav>

          {/* Main */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <header className="flex items-center justify-end px-6 py-3 border-b border-gray-200 dark:border-gray-700">
              <ThemeToggle />
            </header>

            <main className="flex-1 p-6 overflow-auto">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      {children}
    </Link>
  );
}
