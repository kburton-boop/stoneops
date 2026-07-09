"use client";

import { useEffect, useState } from "react";
import { CustomerAccountDetailDrawer } from "@/components/customerAccounts/CustomerAccountDetailDrawer";

interface CustomerAccountSummary {
  id: string;
  name: string;
  contacts: { id: string; name: string; role: string | null }[];
  openTopicCount: number;
  preview: string | null;
}

export function CustomersBoard() {
  const [accounts, setAccounts] = useState<CustomerAccountSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openAccountId, setOpenAccountId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/customer-accounts")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load customers");
        return res.json();
      })
      .then((data: { accounts: CustomerAccountSummary[] }) => {
        if (!cancelled) setAccounts(data.accounts);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load customers.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-hot">{error}</p>;
  if (!accounts) return <p className="text-sm text-ink-3">Loading…</p>;
  if (accounts.length === 0) return <p className="text-sm text-ink-3">No customer accounts yet.</p>;

  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {accounts.map((account) => (
          <li key={account.id}>
            <button
              type="button"
              onClick={() => setOpenAccountId(account.id)}
              className="w-full rounded border border-ink-2 px-3 py-2 text-left text-sm hover:border-accent"
            >
              <div className="flex items-center justify-between">
                <span className="text-ink-4">{account.name}</span>
                {account.openTopicCount > 0 && (
                  <span className="rounded bg-warm/20 px-1.5 py-0.5 font-mono text-xs text-warm">
                    {account.openTopicCount} open
                  </span>
                )}
              </div>
              {account.contacts.length > 0 && (
                <p className="mt-1 truncate text-xs text-ink-3">
                  {account.contacts.map((c) => c.name).join(", ")}
                </p>
              )}
              {account.preview && <p className="mt-1 truncate text-xs text-ink-3">{account.preview}</p>}
            </button>
          </li>
        ))}
      </ul>

      {openAccountId && (
        <CustomerAccountDetailDrawer accountId={openAccountId} onClose={() => setOpenAccountId(null)} />
      )}
    </>
  );
}
