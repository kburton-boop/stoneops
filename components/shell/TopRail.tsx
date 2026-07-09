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

  return <span className="font-mono text-sm text-ink-3">{formatClock(now)}</span>;
}

export function TopRail() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-ink-2 px-6 py-3">
      <span className="font-mono text-sm text-ink-4">Stone Transport Ops OS</span>
      <nav className="flex gap-1">
        {TABS.map((tab) => {
          if (!tab.href) {
            return (
              <span
                key={tab.label}
                title="Not built yet"
                className="cursor-not-allowed rounded px-3 py-1.5 text-sm text-ink-3 opacity-40"
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
              className={`rounded px-3 py-1.5 text-sm ${
                active ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Clock />
    </header>
  );
}
