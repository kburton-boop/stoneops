"use client";

import { useEffect, useState } from "react";
import { CustomerAccountDetailDrawer } from "@/components/customerAccounts/CustomerAccountDetailDrawer";

interface CustomerAccountSummary {
  id: string;
  name: string;
  status: "hot" | "warm" | "cool" | "stable" | "pending_confirmation";
  contacts: { id: string; name: string; role: string | null }[];
  openTopicCount: number;
  preview: string | null;
}

function AccountCard({
  account,
  onOpen,
}: {
  account: CustomerAccountSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-h-11 w-full rounded border border-ink-2 px-3 py-2 text-left text-sm hover:border-accent"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-4">{account.name}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {account.status === "pending_confirmation" && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-xs text-accent">
              unconfirmed
            </span>
          )}
          {account.openTopicCount > 0 && (
            <span className="rounded bg-warm/20 px-1.5 py-0.5 font-mono text-xs text-warm">
              {account.openTopicCount} open
            </span>
          )}
        </div>
      </div>
      {account.contacts.length > 0 && (
        <p className="mt-1 truncate text-xs text-ink-3">{account.contacts.map((c) => c.name).join(", ")}</p>
      )}
      {account.preview && <p className="mt-1 truncate text-xs text-ink-3">{account.preview}</p>}
    </button>
  );
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

  const pending = accounts.filter((a) => a.status === "pending_confirmation");
  const confirmed = accounts.filter((a) => a.status !== "pending_confirmation");

  return (
    <>
      {pending.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">
            Pending confirmation ({pending.length})
          </p>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pending.map((account) => (
              <li key={account.id}>
                <AccountCard account={account} onOpen={() => setOpenAccountId(account.id)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmed.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {confirmed.map((account) => (
            <li key={account.id}>
              <AccountCard account={account} onOpen={() => setOpenAccountId(account.id)} />
            </li>
          ))}
        </ul>
      )}

      {openAccountId && (
        <CustomerAccountDetailDrawer accountId={openAccountId} onClose={() => setOpenAccountId(null)} />
      )}
    </>
  );
}
