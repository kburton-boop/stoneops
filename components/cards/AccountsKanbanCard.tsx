"use client";

import { useState } from "react";
import { Panel } from "@/components/shell/Panel";
import { AccountDetailDrawer } from "@/components/accounts/AccountDetailDrawer";
import type { AccountSummaryCard, KanbanColumn } from "@/lib/accounts/queries";

const COLUMN_ORDER: KanbanColumn[] = ["Active Issue", "This Week", "Monitoring", "Stable"];
const COLUMN_ACCENT: Record<KanbanColumn, string> = {
  "Active Issue": "text-hot",
  "This Week": "text-warm",
  Monitoring: "text-cool",
  Stable: "text-stable",
};

export function AccountsKanbanCard({ accounts }: { accounts: AccountSummaryCard[] }) {
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  return (
    <Panel title="Accounts">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {COLUMN_ORDER.map((column) => {
          const inColumn = accounts.filter((account) => account.column === column);
          return (
            <div key={column}>
              <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${COLUMN_ACCENT[column]}`}>
                {column}
              </p>
              <ul className="space-y-1">
                {inColumn.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      onClick={() => setOpenAccountId(account.id)}
                      className="w-full rounded border border-ink-2 px-2 py-1 text-left text-sm text-ink-4 hover:border-accent"
                    >
                      <span className="block">{account.name}</span>
                      {account.preview && (
                        <span className="block truncate text-xs text-ink-3">{account.preview}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {openAccountId && (
        <AccountDetailDrawer accountId={openAccountId} onClose={() => setOpenAccountId(null)} />
      )}
    </Panel>
  );
}
