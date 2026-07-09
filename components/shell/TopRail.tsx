"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Home", href: "/" },
  { label: "Accounts", href: "/accounts" },
  { label: "Finance", href: "/finance" },
  { label: "Fleet", href: "/fleet" },
  { label: "Review", href: "/review" },
];

export function TopRail() {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between border-b border-ink-2 px-6 py-3">
      <span className="font-mono text-sm text-ink-4">Stone Transport Ops OS</span>
      <nav className="flex gap-1">
        {TABS.map((tab) => {
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
      <span className="font-mono text-sm text-ink-3">Mon, Jan 12 · 8:42 AM</span>
    </header>
  );
}
