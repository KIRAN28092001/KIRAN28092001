"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { navFor } from "@/lib/nav";
import { ROLE_LABEL, cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { ICONS } from "./icons";
import { Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";

export function AppShell({ profile, unread, children }: { profile: Profile; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = navFor(profile.role);
  const mobileItems = items.filter((i) => i.mobile);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const initials = profile.full_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                active ? "bg-brand-yellow text-brand-charcoal" : "text-zinc-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-lg focus:bg-brand-yellow focus:px-4 focus:py-2 focus:font-bold focus:text-black">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-charcoal text-white lg:flex" aria-label="Main navigation">
        <div className="border-b border-white/10 px-5 py-5 [&_.text-zinc-500]:text-zinc-400">
          <Wordmark />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks />
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-yellow font-bold text-brand-charcoal" aria-hidden>{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{profile.full_name}</div>
              <div className="truncate text-xs text-zinc-400">{ROLE_LABEL[profile.role]}</div>
            </div>
            <form action="/auth/signout" method="post">
              <button className="btn btn-sm px-2 text-zinc-300 hover:bg-white/10 hover:text-white" aria-label="Sign out">
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 lg:pl-64">
        <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <button className="btn btn-ghost px-3" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
              <Menu className="h-6 w-6" aria-hidden />
            </button>
            <Link href="/dashboard" aria-label="Tool Connected home">
              <Wordmark />
            </Link>
          </div>
          <div className="hidden text-sm font-semibold text-zinc-600 dark:text-zinc-400 lg:block">
            {ROLE_LABEL[profile.role]} workspace
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell userId={profile.id} initialUnread={unread} />
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-brand-charcoal text-white shadow-panel">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 [&_.text-zinc-500]:text-zinc-400">
              <Wordmark />
              <button className="btn btn-sm px-2 text-white hover:bg-white/10" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </nav>
            <div className="border-t border-white/10 p-4">
              <div className="mb-3 text-sm">
                <div className="font-bold">{profile.full_name}</div>
                <div className="text-xs text-zinc-400">{ROLE_LABEL[profile.role]}</div>
              </div>
              <form action="/auth/signout" method="post">
                <button className="btn w-full border-2 border-white/20 text-white hover:bg-white/10">
                  <LogOut className="h-5 w-5" aria-hidden /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <main id="main" className="px-3 pb-28 pt-5 sm:px-6 lg:pb-10 lg:pl-[calc(16rem+1.5rem)]">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-zinc-800 dark:bg-zinc-950 lg:hidden" aria-label="Quick navigation">
        <ul className="grid grid-cols-5">
          {mobileItems.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex min-h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-bold", active ? "text-amber-700 dark:text-brand-yellow" : "text-zinc-600 dark:text-zinc-400")}
                >
                  <span className={cn("rounded-full px-4 py-1", active && "bg-brand-yellow/25")}>
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  {item.label === "Request Tool" ? "Request" : item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button onClick={() => setMenuOpen(true)} className="flex min-h-[64px] w-full flex-col items-center justify-center gap-1 text-[11px] font-bold text-zinc-600 dark:text-zinc-400" aria-label="More menu">
              <span className="rounded-full px-4 py-1"><Menu className="h-6 w-6" aria-hidden /></span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
