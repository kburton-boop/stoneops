import type { ReactNode } from "react";

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-ink-2 bg-ink-1">
      <header className="flex items-center justify-between border-b border-ink-2 px-4 py-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
