"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS = [
  { label: "Home", href: "/" },
  { label: "Accounts", href: "/accounts" },
  { label: "Finance", href: null },
  { label: "Fleet", href: null },
  { label: "Review", href: "/review" },
];

const CLOCK_TICK_MS = 30_000;

function formatClock(date: Date): string {
  const datePart = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return <span className="shrink-0 font-mono text-xs text-ink-3 sm:text-sm">{formatClock(now)}</span>;
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

export function TopRail() {
  const pathname = usePathname();
  // No effect needed to reset this on navigation: every route here is a
  // distinct page.tsx rendering its own <Shell><TopRail/>, so TopRail fully
  // unmounts and remounts on navigation rather than persisting across routes.
  const [menuOpen, setMenuOpen] = useState(false);

  function renderTab(tab: (typeof TABS)[number], mobile: boolean) {
    const baseClass = mobile
      ? "flex min-h-11 w-full items-center rounded px-3 text-base"
      : "rounded px-3 py-1.5 text-sm";

    if (!tab.href) {
      return (
        <span
          key={tab.label}
          title="Not built yet"
          className={`cursor-not-allowed text-ink-3 opacity-40 ${baseClass}`}
        >
          {tab.label}
        </span>
      );
    }

    const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className={`${baseClass} ${active ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"}`}
      >
        {tab.label}
      </Link>
    );
  }

  return (
    <header className="relative border-b border-ink-2">
      <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink-4 hover:bg-ink-2 md:hidden"
          >
            <HamburgerIcon open={menuOpen} />
          </button>
          <span className="truncate font-mono text-sm text-ink-4">
            <span className="hidden sm:inline">Stone Transport Ops OS</span>
            <span className="sm:hidden">Stone Ops</span>
          </span>
        </div>

        <nav className="hidden gap-1 md:flex">{TABS.map((tab) => renderTab(tab, false))}</nav>

        <Clock />
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-[57px] z-40 bg-black/40 md:hidden"
          />
          <nav className="absolute inset-x-0 top-full z-50 border-b border-ink-2 bg-ink-1 p-2 shadow-lg md:hidden">
            <ul className="space-y-1">
              {TABS.map((tab) => (
                <li key={tab.label}>{renderTab(tab, true)}</li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
}
