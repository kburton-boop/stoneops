"use client";

import { useState } from "react";
import { Panel } from "@/components/shell/Panel";
import { AccountDetailDrawer } from "@/components/accounts/AccountDetailDrawer";
import { CustomersBoard } from "@/components/cards/CustomersBoard";
import type { AccountSummaryCard, KanbanColumn } from "@/lib/accounts/queries";

const COLUMN_ORDER: KanbanColumn[] = ["Active Issue", "This Week", "Monitoring", "Stable"];
const COLUMN_ACCENT: Record<KanbanColumn, string> = {
  "Active Issue": "text-hot",
  "This Week": "text-warm",
  Monitoring: "text-cool",
  Stable: "text-stable",
};

type Tab = "plants" | "customers";

export function AccountsKanbanCard({ accounts }: { accounts: AccountSummaryCard[] }) {
  const [tab, setTab] = useState<Tab>("plants");
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  return (
    <Panel
      title="Accounts"
      action={
        <div className="flex gap-1 text-xs">
          {(["plants", "customers"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setTab(option)}
              className={`rounded px-2 py-1 capitalize ${
                tab === option ? "bg-ink-2 text-ink-4" : "text-ink-3 hover:text-ink-4"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      }
    >
      {tab === "plants" ? (
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
      ) : (
        <CustomersBoard />
      )}

      {openAccountId && (
        <AccountDetailDrawer accountId={openAccountId} onClose={() => setOpenAccountId(null)} />
      )}
    </Panel>
  );
}
